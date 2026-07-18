import React from "react";
import ReactDOM from "react-dom/client";
import "../index.css";
import { SpaceApp } from "./SpaceApp";
import "./space.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SpaceApp />
  </React.StrictMode>
);
