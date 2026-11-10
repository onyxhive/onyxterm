import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { keepLinksInsideOnyx } from "./links";
import "./styles/app.css";

keepLinksInsideOnyx();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
