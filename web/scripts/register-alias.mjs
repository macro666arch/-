/**
 * 注册 "@/" 别名解析，必须在 import 业务代码之前执行。
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve as r } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(r(HERE, "alias-loader.mjs")).href, pathToFileURL(HERE));
