import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { StructuredLogger } from './common/structured-logger.service';

async function bootstrap() {
  const logger = new StructuredLogger('Bootstrap');
  const app = await NestFactory.create(AppModule, { logger });
  configureApp(app);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') ?? 3000;

  await app.listen(port);
  logger.log({
    event: 'api_started',
    port,
  });
}
void bootstrap();
