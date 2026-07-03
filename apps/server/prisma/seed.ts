async function main() {
  console.log("MVP 运行时当前使用本地文件存储，seed 保留为后续 Prisma/SQLite 接入占位。");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
