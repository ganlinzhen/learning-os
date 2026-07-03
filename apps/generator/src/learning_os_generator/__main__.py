import os

import uvicorn


def main() -> None:
    host = os.environ.get("LEARNING_OS_GENERATOR_HOST", "127.0.0.1")
    port = int(os.environ.get("LEARNING_OS_GENERATOR_PORT", "8000"))
    uvicorn.run("learning_os_generator.api.app:app", host=host, port=port)


if __name__ == "__main__":
  main()
