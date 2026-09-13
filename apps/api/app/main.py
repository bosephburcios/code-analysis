from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(
    title="CodeAnalyzer API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RepositoryImportRequest(BaseModel):
    url: str
    
class RepositoryMetadata(BaseModel):
    owner: str
    name: str
    full_name: str
    description: str | None
    default_branch: str
    language: str | None
    stars: int
    forks: int
    open_issues: int
    visibility: str
    html_url: str
    
def parse_github_url(url: str) -> tuple[str, str]:
    try:
        parsed = urlparse(url)

        if parsed.hostname not in {"github.com", "www.github.com"}:
            raise ValueError()

        parts = [
            part
            for part in parsed.path.strip("/").split("/")
            if part
        ]

        if len(parts) < 2:
            raise ValueError()

        owner = parts[0]
        repo = parts[1]

        if repo.endswith(".git"):
            repo = repo[:-4]

        return owner, repo

    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Enter a valid GitHub repository URL.",
        )


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post(
    "/repositories/import",
    response_model=RepositoryMetadata,
)
async def import_repository(
    request: RepositoryImportRequest,
):
    owner, repo = parse_github_url(request.url)

    github_url = f"https://api.github.com/repos/{owner}/{repo}"

    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(
            github_url,
            headers={
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )

    if response.status_code == 404:
        raise HTTPException(
            status_code=404,
            detail="Repository not found. Make sure it is public and the URL is correct.",
        )

    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail="GitHub could not be reached. Try again shortly.",
        )

    data = response.json()

    return RepositoryMetadata(
        owner=data["owner"]["login"],
        name=data["name"],
        full_name=data["full_name"],
        description=data.get("description"),
        default_branch=data["default_branch"],
        language=data.get("language"),
        stars=data["stargazers_count"],
        forks=data["forks_count"],
        open_issues=data["open_issues_count"],
        visibility=data.get("visibility", "public"),
        html_url=data["html_url"],
    )