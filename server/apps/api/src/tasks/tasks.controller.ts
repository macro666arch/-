import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SnakeCaseInterceptor } from '../common/interceptors/snake-case.interceptor';

@UseGuards(JwtAuthGuard)
@UseInterceptors(SnakeCaseInterceptor)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  list(@Req() req: any) {
    return this.tasksService.list(req.user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: any, @Body() body: unknown) {
    return this.tasksService.create(req.user.id, body);
  }

  @Put(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    return this.tasksService.update(req.user.id, id, body);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.tasksService.remove(req.user.id, id);
  }
}
