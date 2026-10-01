# Ting Reader 插件商店

为 Ting Reader 提供插件目录，可在插件配置中设置插件源地址。

## 安装与配置

从 Release 下载签名的 `.tr` 包，在服务端的插件管理页面安装。主程序发行包会预装插件商店。

默认插件源为 `https://www.tingreader.cn/api/plugins`。自定义插件源应使用 HTTPS；本地或局域网测试也可使用 HTTP。

插件源返回插件数组，或包含 `plugins` 数组的对象。条目中的下载地址应对应声明版本的签名包。

## 构建与发布

业务入口为 `plugin.js`，清单为 `plugin.yml`。修改代码后执行 `node --check plugin.js` 和 `node --check sdk.mjs`。

更新清单版本并推送到 `main` 后，GitHub Actions 使用 trpack 校验、签名打包，并发布 `.tr` 文件与 SHA-256 校验文件。发布签名使用仓库的 `TRPACK_SIGNING_KEY` Secret。
