import dotenv from "dotenv";
import { createApp } from "./app";

dotenv.config();

const PORT = process.env.PORT || 3310;
const app = createApp();

app.listen(PORT, () => {
  console.log(`DYNAMIC API listening on port ${PORT}`);
});

export default app;
