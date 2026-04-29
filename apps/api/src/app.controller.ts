import { Controller, Get } from "@nestjs/common";
import { publicUrl } from "./config";

@Controller()
export class AppController {
  @Get("health")
  health() {
    return {
      ok: true,
      name: "Slavnogram",
      publicUrl: publicUrl(),
      time: new Date().toISOString(),
    };
  }
}
