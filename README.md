# 基于以下开源项目

- [wt-tracker](https://github.com/Novage/wt-tracker) | [Forked](https://github.com/HV-LIVE/wt-tracker)

# 同步构建结果

- 编译 [wt-tracker](https://github.com/HV-LIVE/wt-tracker) 项目，从源项目同步以下文件到本项目中：

  - 将源项目 `dist` 同步到本项目 `wt-tracker` 目录中

  - 将源项目 `package.json` 同步到本项目 `wt-tracker` 目录中

  - 将源项目 `package-lock.json` 同步到本项目 `wt-tracker` 目录中

- 当前同步的分支: [main](https://github.com/HV-LIVE/wt-tracker/tree/main)

- 当前同步的提交: [367c8d8](https://github.com/HV-LIVE/wt-tracker/commit/367c8d879ebe8323df3923b3b206a04530d2f346)

# 编译镜像

```sh
docker build -t hvlive/wt-tracker:latest .
```

# 部署镜像

> 若需要指定配置文件，[查看文档](https://github.com/HV-LIVE/wt-tracker#configuration)

```sh
# 默认配置启动
docker run -d --restart=unless-stopped \
    --name wt-tracker \
    -p {host_port}:8000 \
    hvlive/wt-tracker:latest

# 指定配置启动
docker run -d --restart=unless-stopped \
    --name wt-tracker \
    -p {host_port}:8000 \
    -v {host_config_path}:/etc/wt-tracker \
    hvlive/wt-tracker:latest
```
