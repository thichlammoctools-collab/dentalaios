import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "@/lib/auth-context";
import { PlatformAuthProvider } from "@/lib/platform-auth-context";
import { ThemeProvider } from "@/lib/theme";
import { ToastProvider } from "@/lib/toast";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <PlatformAuthProvider>
          <AuthProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AuthProvider>
        </PlatformAuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
