import { Home } from "@/components/Home";

// The whole screen depends on the signed-in user, which only the browser
// knows, so there is nothing to prerender for instant navigation.
export const instant = false;

export default function HomePage() {
  return <Home />;
}
