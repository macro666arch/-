import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser');
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 全局 /api 前缀（对应接口契约）
  app.setGlobalPrefix('api');

  // 生产环境只允许明确配置的前端来源；开发环境未配置时保持本机调试便利。
  const allowedOrigins = new Set(
    [
      process.env.FRONTEND_URL,
      ...(process.env.CORS_ORIGINS ?? '').split(','),
    ]
      .map((origin) => origin?.trim())
      .filter((origin): origin is string => Boolean(origin)),
  );
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      if (allowedOrigins.size === 0 && process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  });

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('NAU AI Advisor API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
