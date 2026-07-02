import { permanentRedirect } from "next/navigation";

export default function ForYouRedirect() {
  permanentRedirect("/films");
}
