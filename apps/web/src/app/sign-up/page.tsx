import { SignUpForm } from "@/components/auth/sign-up-form";

export default function SignUpPage() {
  return (
    <main className="flex min-h-[calc(100svh-6.5rem)] md:min-h-svh items-center justify-center bg-background px-6 py-12">
      <SignUpForm />
    </main>
  );
}
