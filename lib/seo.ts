import type { Metadata } from "next";
import seoData from "@/app/data/seo.json";

const homeSeo = seoData[0];
const dramaSeo = seoData[1];

export function getHomeMetadata(): Metadata {
  return {
    title: homeSeo.home_title,
    description: homeSeo.home_description,
    keywords: homeSeo.home_keywords,
  };
}

export function getDramaMetadata(): Metadata {
  return {
    title: dramaSeo.drama_title,
    description: dramaSeo.drama_description,
    keywords: dramaSeo.drama_keywords,
  };
}
