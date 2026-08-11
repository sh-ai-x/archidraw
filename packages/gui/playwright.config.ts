import {defineConfig,devices} from "@playwright/test";
export default defineConfig({testDir:"./e2e",use:{baseURL:"http://localhost:5173",...devices["Desktop Chrome"],screenshot:"only-on-failure"},webServer:{command:"pnpm dev --host 127.0.0.1",url:"http://localhost:5173",reuseExistingServer:true}});
