import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/get-session";
import { importLimiter, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "You must be signed in to import a repository." },
        { status: 401 }
      );
    }

    const limit = await importLimiter.limit(session.user.id);
    if (!limit.success) return rateLimitResponse(limit);

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
          ...(process.env.GITHUB_TOKEN
            ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
            : {}),
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
        userId_fullName: {
          userId: session.user.id,
          fullName: githubRepo.full_name,
        },
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
        userId: session.user.id,
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
