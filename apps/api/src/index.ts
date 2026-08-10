import "dotenv/config";
import { createApp } from "./app";

const PORT = process.env.PORT || 3310;
const app = createApp();

app.listen(PORT, () => {
  console.log(`DYNAMIC API listening on port ${PORT}`);
});

export default app;
