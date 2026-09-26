import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import { App } from "./App.tsx";
import "./styles/app.css";

registerSW({ immediate: true });

const container = document.getElementById("root");

if (!container) {
  throw new Error("Unable to find the root element for the dashboard app.");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
