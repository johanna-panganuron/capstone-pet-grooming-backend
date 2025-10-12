// pet-grooming-back-end socketServer.js
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');

let io;

// Initialize Socket.io
function initSocket(server) {
  io = socketIo(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:5173",
      methods: ["GET", "POST"]
    }
  });

  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.userRole = decoded.role;
      next();
    } catch (error) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    console.log('🔌 User connected:', socket.userId);
    
    // Join user to their personal room
    socket.join(`user-${socket.userId}`);
    
    socket.on('disconnect', () => {
      console.log('🔌 User disconnected:', socket.userId);
    });
  });

  return io;
}

// Send notifications to specific users
// Update your socketServer.js
function sendNotificationToUser(userId, notification) {
  if (!io) {
    console.error('Socket.io not initialized');
    return false;
  }
  
  const userRoom = `user-${userId}`;
  console.log(`🔍 Attempting to send notification to room: ${userRoom}`);
  
  // Check if the room exists and has active connections
  const room = io.sockets.adapter.rooms.get(userRoom);
  console.log(`🔍 Room ${userRoom} has ${room ? room.size : 0} connections`);
  
  if (room && room.size > 0) {
    io.to(userRoom).emit('new-notification', {
      notification,
      timestamp: new Date()
    });
    console.log(`✅ Notification sent to user ${userId} in room ${userRoom}`);
    return true;
  } else {
    console.log(`❌ No active connections in room ${userRoom}`);
    return false;
  }
}

module.exports = {
  initSocket,
  sendNotificationToUser,
  getIO: () => io
};