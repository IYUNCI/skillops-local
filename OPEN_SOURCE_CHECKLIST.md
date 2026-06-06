# Open Source 上线检查清单

- [ ] 代码清理
  - [x] 去掉本地敏感配置、临时文件、构建产物
  - [x] 检查是否有硬编码 token/个人路径/密钥
- [ ] 许可证
  - [x] LICENSE 已存在（MIT）
- [ ] 仓库说明
  - [x] README 包含安装与快速开始
- [x] 在 README 添加 GitHub 仓库与贡献方式（已确认 `your-org/skillops-local`）
- [ ] 文档
  - [x] CONTRIBUTING.md 存在
  - [x] DEPLOYMENT.md 存在
  - [x] 生成发布文案（`PROMOTION.md`）
  - [x] 补充 App Store 商品文案与截图说明（`APP_STORE_METADATA.md`）
- [ ] 自动化
  - [x] release workflow 已有
  - [x] 如需 App Store 包，补充签名与上传说明
- [ ] 版本与发布
- [ ] `package.json` version 与标签一致
  - [ ] 创建首个 tag（v0.1.1）
  - [ ] 在 GitHub 上发布 Release 并附带说明
  - [ ] 将 `release-notes` 中对应版本内容同步到 GitHub Release 与 App Store `What\u2019s New`

## 推荐发布文案
- 中文版和英文版发布文案放在 `PROMOTION.md`
