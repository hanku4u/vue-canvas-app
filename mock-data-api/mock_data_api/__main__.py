import os

import uvicorn


def main() -> None:
    uvicorn.run(
        "mock_data_api.main:app",
        host=os.environ.get("MOCK_HOST", "127.0.0.1"),
        port=int(os.environ.get("MOCK_PORT", 8001)),
        reload=os.environ.get("MOCK_RELOAD", "") == "1",
    )


if __name__ == "__main__":
    main()
