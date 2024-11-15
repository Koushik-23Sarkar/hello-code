const http = require('http');
const express = require('express');
const dockerode = require('dockerode');
const httpProxy = require('http-proxy');

const managementAPI = express();
const docker = new dockerode({socketPath: "/var/run/docker.sock"});
const proxy = httpProxy.createProxy({});

const db = new Map(); // in where we will get the ip addresses;


docker.getEvents(function(err,stream) {
    if(err){
        console.log('Error is getting events',err);
        return;
    }

    stream.on('data',async (chunk)=>{
        if(!chunk) return;
        const event = JSON.parse(chunk.toString());

        if(event.Type === 'container' && event.Action == 'start'){
            const container = docker.getContainer(event.id);
            const containerInfo = await container.inspect();

            const containerName = containerInfo.Name.substring(1);
            const containerIpAddress = containerInfo.NetworkSettings.IPAddress;


            const exportPORT = Object.keys(containerInfo.Config.ExposedPorts);

            let port = null;

            if(exportPORT && exportPORT.length > 0){
                const [defaultPort , type] = exportPORT[0].split('/');

                if(type === 'tcp'){
                    defaultPort = port;
                }
            }
            console.log(
                `Registering ${containerName}.localhost ---> http://${containerIpAddress}:${defaultPort}`
            );
            db.set(containerName, {containerName , containerIpAddress , defaultPort});
        }
    })
})

const reverseProxyApp = express();

reverseProxyApp.use(function (req,res){
    const hostname = req.hostname;
    const subDomain = hostname.split('.')[0]; 
    // get the container name from domain and now we need to find it's ipaddress 

    if(!db.has(subDomain)) return res.status(404).end(404);

    const {containerIpAddress , defaultPort } = db.get(subDomain);

    const target = `http://${containerIpAddress}:${defaultPort}`;
    console.log(`forwading ${hostname} --> ${target}`);

    return proxy.web(req,res,{target,changeOrigin:true});
    
});

const reverseProxy = http.createServer(reverseProxyApp);



//Managment API ------------Code-----------------------
managementAPI.post('/makeContainer', async (req,res)=>{
    const {image , tag='latest'} = req.body;

    let imageAlreadyExists = false;  // it's a flag to know is that image we already have or not. 

    const images = await docker.listImages();

    for (const systemImages of images){
        for(const systemTag of systemImages.RepoTags){
            if(systemTag === `${image}:${tag}`){
                imageAlreadyExists = true;
                break;
            }
        }

        if(imageAlreadyExists) break;
    }

    if(!imageAlreadyExists) {
        console.log(`Pulling Image: ${image}:${tag}`);
        await docker.pull(`${image}:${tag}`);
    }


    const container = await docker.createContainer({
        Image:`${image}:${tag}`,
        Tty: false,
        HostConfig:{
            AutoRemove:true,
        }
    });

    await container.start();

    return res.json({
        status: 'success',
        container: `${(await container.inspect()).Name}.localhost`     //
    });

 })


 managementAPI.listen(8080,()=>console.log('Management API is running on PORT 8080'));
 reverseProxy.listen(80,()=>console.log(`Reverse proxy is running on PORT 80`));