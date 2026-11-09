import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// 把返回值的 key 从 camelCase 递归转成 snake_case，
// 让后端返回的字段名与《接口契约》§1.3 的 snake_case 完全一致（丙的前端按这个接）。
function toSnakeCase(value: any): any {
  if (Array.isArray(value)) return value.map(toSnakeCase);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      const snake = k.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
      out[snake] = toSnakeCase(v);
    }
    return out;
  }
  return value;
}

@Injectable()
export class SnakeCaseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((data) => toSnakeCase(data)));
  }
}
