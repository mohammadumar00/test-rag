import "dotenv/config";
import express from "express";

const app = express();
const configuredPort = Number(process.env.API_PORT ?? 3001);
const port = Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : 3001;

app.get("/health", (_request, response) => {
  response.status(200).json({ status: "ok" });
});

app.listen(port, () => {
  console.info(`API listening on http://localhost:${port}`);
});
