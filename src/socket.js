import { io } from "socket.io-client";

const socket = io('https://collabflexify-backend.onrender.com', {
  autoConnect: false,
});

export default socket;
