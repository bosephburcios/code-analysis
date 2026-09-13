import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json(
        { error: "Repository URL is required." },
        { status: 400 }
      );
    }

    const parsedUrl = new URL(url);

    if (
      parsedUrl.hostname !== "github.com" &&
      parsedUrl.hostname !== "www.github.com"
    ) {
      return NextResponse.json(
        { error: "Enter a valid GitHub repository URL." },
        { status: 400 }
      );
    }

    const parts = parsedUrl.pathname.split("/").filter(Boolean);

    if (parts.length < 2) {
      return NextResponse.json(
        { error: "Enter a valid GitHub repository URL." },
        { status: 400 }
      );
    }

    const owner = parts[0];
    const name = parts[1].replace(/\.git$/, "");

    const githubResponse = await fetch(
      `https://api.github.com/repos/${owner}/${name}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    if (githubResponse.status === 404) {
      return NextResponse.json(
        {
          error:
            "Repository not found. Make sure it is public and the URL is correct.",
        },
        { status: 404 }
      );
    }

    if (!githubResponse.ok) {
      return NextResponse.json(
        { error: "Unable to retrieve repository from GitHub." },
        { status: 502 }
      );
    }

    const githubRepo = await githubResponse.json();

    const repository = await prisma.repository.upsert({
      where: {
        fullName: githubRepo.full_name,
      },
      update: {
        description: githubRepo.description,
        defaultBranch: githubRepo.default_branch,
        language: githubRepo.language,
        stars: githubRepo.stargazers_count,
        forks: githubRepo.forks_count,
        visibility: githubRepo.visibility ?? "public",
      },
      create: {
        owner: githubRepo.owner.login,
        name: githubRepo.name,
        fullName: githubRepo.full_name,
        githubUrl: githubRepo.html_url,
        description: githubRepo.description,
        defaultBranch: githubRepo.default_branch,
        language: githubRepo.language,
        stars: githubRepo.stargazers_count,
        forks: githubRepo.forks_count,
        visibility: githubRepo.visibility ?? "public",
      },
    });

    return NextResponse.json(repository);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Something went wrong while importing the repository." },
      { status: 500 }
    );
  }
}
