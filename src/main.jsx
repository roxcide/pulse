import React from "react";
import { createRoot } from "react-dom/client";
import AuthGate from "./auth/AuthGate.jsx";
import { AuthProvider } from "./auth/AuthProvider.jsx";
import "./styles.css";
import "./themes.css";
import { ThemeProvider } from "./theme";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
