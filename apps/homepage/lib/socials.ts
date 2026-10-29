import type { IconType } from "react-icons";
import { FaLinkedin } from "react-icons/fa6";
import {
  SiInstagram,
  SiThreads,
  SiTiktok,
  SiX,
  SiYoutube,
} from "react-icons/si";

// Urganize's social accounts. Shared by the footer's icon row and the
// header menu's Community section, so the two never list different accounts.
export const SOCIAL_LINKS: readonly {
  href: string;
  name: string;
  label: string;
  Icon: IconType;
}[] = [
  { href: "https://x.com/urganize", name: "X", label: "Urganize on X", Icon: SiX },
  {
    href: "https://www.linkedin.com/company/urganize",
    name: "LinkedIn",
    label: "Urganize on LinkedIn",
    Icon: FaLinkedin,
  },
  {
    href: "https://www.instagram.com/urganize",
    name: "Instagram",
    label: "Urganize on Instagram",
    Icon: SiInstagram,
  },
  {
    href: "https://www.tiktok.com/@urganize",
    name: "TikTok",
    label: "Urganize on TikTok",
    Icon: SiTiktok,
  },
  {
    href: "https://www.youtube.com/@urganize",
    name: "YouTube",
    label: "Urganize on YouTube",
    Icon: SiYoutube,
  },
  {
    href: "https://www.threads.net/@urganize",
    name: "Threads",
    label: "Urganize on Threads",
    Icon: SiThreads,
  },
];
