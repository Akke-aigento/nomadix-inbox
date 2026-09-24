import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { registerServiceWorker } from "./lib/pwa";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

registerServiceWorker();
