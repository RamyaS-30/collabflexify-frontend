import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Signup from "./pages/Signup";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import JoinWorkspace from "./pages/JoinWorkspace";

function App() {
  const handleLogin = (user) => {
    console.log("Logged in user:", user);
    localStorage.setItem('user', JSON.stringify(user));
    window.location.href="/dashboard";
  };

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/login" element={<Login onLogin={handleLogin} />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password/:token" element={<ResetPassword />} />
      <Route path="/join/:inviteCode" element={<JoinWorkspace />} />
    </Routes>
  );
}

export default App;