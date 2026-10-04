import React from "react";
import { createRoot } from "react-dom/client";
import AuthGate from "./auth/AuthGate.jsx";
import { AuthProvider } from "./auth/AuthProvider.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  </React.StrictMode>,
);
