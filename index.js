const express = require('express');
const app = express();
const {Server} = require('socket.io');
const http = require('http');
const server = http.createServer(app);
const cors = require('cors');
const ACTIONS = require('./client/src/Action');

app.use(cors());

const io = new Server(server, {
    cors: {
        origin: 'http://localhost:3000',
    }
});
 let userSocketMap ={};

 function getAllConnectedClients(roomId){
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map((socketId)=>{
        return {
            socketId,
            userName: userSocketMap[socketId]
        }
    }); //2.26.00
 }

io.on('connection',(socket)=>{
    console.log('socket connected',socket.id);
    


    
    socket.on(ACTIONS.JOIN ,({roomId,userName})=>{
        console.log("On Action join from server !");
        console.log(userName);
        userSocketMap[socket.id] = userName;
        socket.join(roomId);
        const clients = getAllConnectedClients(roomId);
        console.log(clients);
        clients.forEach(({socketId})=>{
            io.to(socketId).emit(ACTIONS.JOINED,{clients,userName,socketId:socket.id,});//we are notified all peoples in the room that someone joined that room
        })
    })

    socket.on(ACTIONS.CODE_CHANGE,({roomId,code , path})=>{
        socket.in(roomId).emit(ACTIONS.CODE_CHANGE,{code,path:path});
    })

    socket.on(ACTIONS.SYNC_CODE,({socketId,code})=>{
        io.to(socketId).emit(ACTIONS.CODE_CHANGE,{code});
    })
    //----------------------VIDEO CALL----------------------------------------------------

    

    //-------------------------------------------------------------------------------------
    socket.on('disconnecting',()=>{ //it will run if someone change the tabs or close the browser window
        const rooms = [...socket.rooms] // oi user er joto room ache, sob get koro
        
        rooms.forEach((roomId)=>{
            socket.in(roomId).emit(ACTIONS.DISCONNECTED,{socketId:socket.id,userName:userSocketMap[socket.id]});
        })

        delete userSocketMap[socket.id];  //Object theke socket id ar userName delete korar jonno

        socket.leave(); //to leave the room.

    })
})



const PORT = 4000;

server.listen(PORT,()=>{
    console.log("Server listening on PORT 4000");
})
