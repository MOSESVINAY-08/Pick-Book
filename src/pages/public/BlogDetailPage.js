/* eslint-disable */
import React, { useEffect, useState, useMemo } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import {
  Calendar,
  User,
  ArrowLeft,
  Facebook,
  Twitter,
  Link2,
  Star,
  Compass,
  MapPin,
  DollarSign,
  Plane,
  Clock,
  ArrowRight,
  BookOpen,
  Sparkles,
  X,
  ChevronLeft,
  ChevronRight,
  Search,
  Maximize2,
  Bookmark,
  Share2,
  Check,
  MessageCircle,
  ShieldCheck,
  ArrowUp,
  Camera,
  Layers
} from "lucide-react";
import {
  getPublicBlogBySlug,
  getPublicBlogs,
  getBlogImageSrc,
  getBlogCategories,
  getBlogSubCategories
} from "../../services/blogService";
import { toApiAssetUrl } from "../../services/apiClient";

import "../../STYLES/BlogPage.css";

// Generates an inline SVG data-URI avatar from the author's initials
function getAvatarFallback(name) {
  const initials = (name || "A")
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "A";
  const colors = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444"];
  const color = colors[(name || "").charCodeAt(0) % colors.length];
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'><rect width='80' height='80' rx='40' fill='${color}'/><text x='50%' y='54%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-weight='bold' font-size='28' fill='#ffffff'>${initials}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// Transforms blog HTML so all inline images resolve to API asset URLs and headings get IDs
function processBlogHtml(htmlContent) {
  if (!htmlContent) return { html: "", headings: [], embeddedImages: [] };

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, "text/html");

    const headings = [];
    doc.querySelectorAll("h2, h3").forEach((h, idx) => {
      const headingId = `blog-heading-${idx}`;
      h.setAttribute("id", headingId);
      headings.push({
        id: headingId,
        text: h.textContent.trim(),
        level: h.tagName.toLowerCase(),
      });
    });

    const embeddedImages = [];
    doc.querySelectorAll("img").forEach((img, idx) => {
      const rawSrc = img.getAttribute("src") || img.getAttribute("data-src") || "";
      const altText = img.getAttribute("alt") || img.getAttribute("title") || "";

      let safeSrc = rawSrc;
      if (rawSrc && !rawSrc.startsWith("data:") && !rawSrc.startsWith("blob:")) {
        const cleaned = rawSrc.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, "");
        safeSrc = toApiAssetUrl(cleaned);
      }

      if (safeSrc) {
        img.setAttribute("src", safeSrc);
        img.setAttribute("loading", "lazy");
        img.setAttribute("data-img-index", String(idx));
        img.classList.add("blog-embedded-image");
        img.setAttribute("style", "cursor: pointer; max-width: 100%; border-radius: 12px; margin: 24px auto; display: block; box-shadow: 0 8px 24px rgba(15,23,42,0.08); transition: transform 0.25s ease;");
        img.setAttribute("onerror", "this.style.display='none'");
        embeddedImages.push({ url: safeSrc, caption: altText });
      }
    });

    return {
      html: doc.body.innerHTML,
      headings,
      embeddedImages,
    };
  } catch (err) {
    console.error("Error processing blog HTML", err);
    return { html: htmlContent, headings: [], embeddedImages: [] };
  }
}

// Aggregates additional images from the blog object
function getAllBlogImages(blog) {
  if (!blog) return [];
  const list = [];
  const seen = new Set();

  const addImage = (src, caption = "") => {
    if (!src || typeof src !== "string") return;
    let clean = src.trim();
    if (!clean || clean === "-" || clean === "null" || clean === "undefined") return;
    clean = clean.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, "");
    const finalUrl = clean.startsWith("data:") || clean.startsWith("blob:") ? clean : toApiAssetUrl(clean);
    if (finalUrl && !seen.has(finalUrl)) {
      seen.add(finalUrl);
      list.push({ url: finalUrl, caption: caption || "" });
    }
  };

  const candidateArrays = [
    blog.images,
    blog.blogImages,
    blog.gallery,
    blog.galleryImages,
    blog.additionalImages,
    blog.photos,
    blog.pictures,
    blog.media,
  ];

  for (const candidate of candidateArrays) {
    if (Array.isArray(candidate)) {
      candidate.forEach((item) => {
        if (typeof item === "string") addImage(item);
        else if (item && typeof item === "object") {
          addImage(
            item.url || item.imageUrl || item.image || item.src || item.filePath || item.photo,
            item.caption || item.title || item.alt
          );
        }
      });
    } else if (typeof candidate === "string" && candidate.trim()) {
      try {
        const parsed = JSON.parse(candidate);
        if (Array.isArray(parsed)) {
          parsed.forEach((item) => {
            if (typeof item === "string") addImage(item);
            else if (item && typeof item === "object") {
              addImage(item.url || item.imageUrl || item.image || item.src, item.caption || item.title);
            }
          });
        }
      } catch {
        if (candidate.includes(",") || candidate.includes(";")) {
          candidate.split(/[,;]/).forEach((s) => addImage(s));
        }
      }
    }
  }

  const singleFields = [
    blog.ogImageUrl,
    blog.ogImage,
    blog.secondaryImage,
    blog.bannerImage,
    blog.coverImage,
  ];
  singleFields.forEach((f) => {
    if (typeof f === "string") addImage(f);
  });

  return list;
}

// Normalizes and unwraps any response into a clean array
function toSafeList(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === "object") {
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.result)) return data.result;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.categories)) return data.categories;
    if (Array.isArray(data.subCategories)) return data.subCategories;
    if (Array.isArray(data.$values)) return data.$values;
    const vals = Object.values(data);
    if (vals.length > 0 && typeof vals[0] === "object") return vals;
  }
  return [];
}

// Cleans strings for normalized case-insensitive comparison
function normalizeStr(val) {
  return String(val || "")
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

// Extracts image URL from an object, handling PascalCase and camelCase
function extractRawImage(obj) {
  if (!obj) return "";
  if (typeof obj === "string") {
    const s = obj.trim();
    if (!s || s === "-" || s === "null" || s === "undefined") return "";
    return s;
  }
  if (typeof obj === "object") {
    const candidates = [
      obj.imageUrl,
      obj.ImageUrl,
      obj.image,
      obj.Image,
      obj.imagePath,
      obj.ImagePath,
      obj.filePath,
      obj.FilePath,
      obj.photo,
      obj.Photo,
      obj.photoUrl,
      obj.PhotoUrl,
      obj.picture,
      obj.Picture,
      obj.icon,
      obj.Icon,
      obj.iconUrl,
      obj.IconUrl,
      obj.thumbnail,
      obj.Thumbnail,
      obj.url,
      obj.Url,
      obj.src,
      obj.Src,
    ];
    for (const c of candidates) {
      if (typeof c === "string") {
        const s = c.trim();
        if (s && s !== "-" && s !== "null" && s !== "undefined") return s;
      }
    }
  }
  return "";
}

function toSafeAssetUrl(raw) {
  if (!raw || typeof raw !== "string") return "";
  let clean = raw.trim();
  if (!clean || clean === "-" || clean === "null" || clean === "undefined") return "";
  clean = clean.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, "");
  return clean.startsWith("data:") || clean.startsWith("blob:") ? clean : toApiAssetUrl(clean);
}

function resolveCategoryImage(blogData, categoriesList) {
  if (!blogData) return "";

  // 1. Direct on blogData
  const directCandidates = [
    blogData.categoryImage,
    blogData.CategoryImage,
    blogData.categoryImageUrl,
    blogData.CategoryImageUrl,
    blogData.categoryPhoto,
    blogData.CategoryPhoto,
    blogData.categoryIcon,
    blogData.CategoryIcon,
    blogData.Category?.imageUrl,
    blogData.Category?.ImageUrl,
    blogData.Category?.image,
    blogData.Category?.Image,
    blogData.category?.imageUrl,
    blogData.category?.ImageUrl,
    blogData.category?.image,
    blogData.category?.Image,
  ];
  for (const c of directCandidates) {
    const url = toSafeAssetUrl(c);
    if (url) return url;
  }

  // 2. From categories list
  const list = toSafeList(categoriesList);
  const catName = normalizeStr(
    blogData.category ||
    blogData.Category ||
    blogData.categoryName ||
    blogData.CategoryName ||
    blogData.Category?.name ||
    blogData.category?.name
  );
  const catId = String(
    blogData.categoryId ||
    blogData.CategoryId ||
    blogData.Category?.id ||
    blogData.Category?.Id ||
    ""
  );

  let match = null;
  if (list.length > 0) {
    match = list.find((item) => {
      const name = normalizeStr(item.name || item.Name || item.categoryName || item.CategoryName);
      const id = String(item.id || item.Id || "");
      if (catId && id && catId === id) return true;
      if (catName && name && (catName === name || catName.includes(name) || name.includes(catName))) return true;
      return false;
    });

    if (!match && list.length === 1) {
      match = list[0];
    }
  }

  // 3. From cached categories in localStorage
  if (!match && typeof window !== "undefined") {
    try {
      const cached = JSON.parse(window.localStorage.getItem("cached_blog_categories") || "[]");
      const cList = toSafeList(cached);
      match = cList.find((item) => {
        const name = normalizeStr(item.name || item.Name || item.categoryName || item.CategoryName);
        const id = String(item.id || item.Id || "");
        if (catId && id && catId === id) return true;
        if (catName && name && (catName === name || catName.includes(name) || name.includes(catName))) return true;
        return false;
      });
      if (!match && cList.length === 1) {
        match = cList[0];
      }
    } catch {
      // ignore
    }
  }

  if (match) {
    const url = toSafeAssetUrl(extractRawImage(match));
    if (url) return url;
  }

  return "";
}

function resolveSubCategoryImage(blogData, subCategoriesList, categoryName) {
  if (!blogData) return "";

  // 1. Direct on blogData
  const directCandidates = [
    blogData.subCategoryImage,
    blogData.SubCategoryImage,
    blogData.subCategoryImageUrl,
    blogData.SubCategoryImageUrl,
    blogData.subCategoryPhoto,
    blogData.SubCategoryPhoto,
    blogData.subCategoryIcon,
    blogData.SubCategoryIcon,
    blogData.SubCategory?.imageUrl,
    blogData.SubCategory?.ImageUrl,
    blogData.SubCategory?.image,
    blogData.SubCategory?.Image,
    blogData.subCategory?.imageUrl,
    blogData.subCategory?.ImageUrl,
    blogData.subCategory?.image,
    blogData.subCategory?.Image,
  ];
  for (const c of directCandidates) {
    const url = toSafeAssetUrl(c);
    if (url) return url;
  }

  const subName = normalizeStr(
    blogData.subCategory ||
    blogData.SubCategory ||
    blogData.subCategoryName ||
    blogData.SubCategoryName ||
    blogData.subcategory ||
    blogData.Subcategory ||
    blogData.SubCategory?.name ||
    blogData.subCategory?.name
  );
  const subCatId = String(
    blogData.subCategoryId ||
    blogData.SubCategoryId ||
    blogData.SubCategory?.id ||
    blogData.SubCategory?.Id ||
    ""
  );
  const titleStr = normalizeStr(blogData.title || blogData.Title || "");
  const catStr = normalizeStr(categoryName || blogData.category || blogData.Category || "");

  const scoreItem = (item) => {
    const name = normalizeStr(item.name || item.Name || item.subCategoryName || item.SubCategoryName);
    const id = String(item.id || item.Id || "");
    const parentCat = normalizeStr(item.category || item.Category || item.categoryName || item.CategoryName);

    if (subCatId && id && subCatId === id) return 100;
    if (subName && name && subName === name) return 90;
    if (subName && name && (subName.includes(name) || name.includes(subName))) return 80;
    if (titleStr && name && (titleStr.includes(name) || name.includes(titleStr))) return 70;
    if (catStr && parentCat && catStr === parentCat) return 60;
    return 0;
  };

  const list = toSafeList(subCategoriesList);
  let best = null;
  let bestScore = 0;

  for (const item of list) {
    const score = scoreItem(item);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  if (!best && list.length === 1) {
    best = list[0];
  }

  // Fallback to localStorage cache
  if (!best && typeof window !== "undefined") {
    try {
      const cached = JSON.parse(window.localStorage.getItem("cached_blog_subcategories") || "[]");
      const cList = toSafeList(cached);
      for (const item of cList) {
        const score = scoreItem(item);
        if (score > bestScore) {
          bestScore = score;
          best = item;
        }
      }
      if (!best && cList.length === 1) {
        best = cList[0];
      }
    } catch {
      // ignore
    }
  }

  if (best) {
    const url = toSafeAssetUrl(extractRawImage(best));
    if (url) return url;
  }

  return "";
}

export default function BlogDetailPage() {
  const { id: slugParam, slug: fallbackSlug } = useParams();
  const slug = slugParam || fallbackSlug;
  const location = useLocation();
  const backPath = location.pathname.startsWith("/travel-guide") ? "/travel-guide" : "/blog";

  const [blog, setBlog] = useState(null);
  const [categoryImg, setCategoryImg] = useState("");
  const [subCategoryImg, setSubCategoryImg] = useState("");
  const [relatedBlogs, setRelatedBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  // Luxury Editorial states
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeHeadingId, setActiveHeadingId] = useState("");
  const [tocSearch, setTocSearch] = useState("");
  const [tocExpanded, setTocExpanded] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [copied, setCopied] = useState(false);

  // Process the HTML content and extract embedded images
  const processedContent = useMemo(() => {
    if (!blog?.longDescription) return { html: "", headings: [], embeddedImages: [] };
    return processBlogHtml(blog.longDescription);
  }, [blog?.longDescription]);

  useEffect(() => {
    const fetchBlogDetailsAndRelated = async () => {
      setLoading(true);
      try {
        // Fetch blog, category list, and subcategory list in parallel
        const [blogData, catsData, subCatsData] = await Promise.all([
          getPublicBlogBySlug(slug),
          getBlogCategories().catch(() => []),
          getBlogSubCategories().catch(() => []),
        ]);

        const resolvedCatImg = resolveCategoryImage(blogData, catsData);
        const resolvedSubCatImg = resolveSubCategoryImage(blogData, subCatsData, blogData?.category);

        setBlog(blogData);
        setCategoryImg(resolvedCatImg);
        setSubCategoryImg(resolvedSubCatImg);
        setError(null);

        // Fetch related blogs in the same category
        try {
          const listData = await getPublicBlogs({ page: 1, pageSize: 6, category: blogData?.category || "" });
          if (listData && listData.blogs) {
            const filtered = listData.blogs.filter((b) => b.slug !== slug).slice(0, 3);
            setRelatedBlogs(filtered);
          }
        } catch (err) {
          console.error("Error fetching related blogs:", err);
        }
      } catch (err) {
        console.error("Error fetching blog details:", err);
        if (err.response && err.response.status === 404) {
          setError("The requested blog article does not exist or is not published.");
        } else {
          setError("Failed to load blog article details.");
        }
      } finally {
        setLoading(false);
      }
    };

    if (slug) {
      fetchBlogDetailsAndRelated();
    }
  }, [slug]);

  // Dynamically set HTML metadata tags
  useEffect(() => {
    if (blog) {
      document.title = `${blog.metaTitle || blog.title || "Travel Story"} | Pick&book Magazine`;
      const metaDescription = document.querySelector('meta[name="description"]');
      if (metaDescription) {
        metaDescription.setAttribute("content", blog.metaDescription || blog.shortDescription || "");
      }
    }
    return () => {
      document.title = "Pick&book - Premium Travel Booking";
    };
  }, [blog]);

  // Reading progress tracker and TOC ScrollSpy
  useEffect(() => {
    const handleScroll = () => {
      const totalScroll = document.documentElement.scrollTop || document.body.scrollTop;
      const windowHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      if (windowHeight > 0) {
        const progress = Math.min(100, Math.max(0, (totalScroll / windowHeight) * 100));
        setScrollProgress(progress);
      }
      setShowScrollTop(totalScroll > 380);

      // ScrollSpy for article headings
      if (processedContent?.headings?.length) {
        const headingElements = processedContent.headings
          .map((h) => document.getElementById(h.id))
          .filter(Boolean);

        for (let i = headingElements.length - 1; i >= 0; i--) {
          const el = headingElements[i];
          const rect = el.getBoundingClientRect();
          if (rect.top <= 140) {
            setActiveHeadingId(el.id);
            break;
          }
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [processedContent?.headings]);

  // Bookmark persistence in localStorage
  useEffect(() => {
    if (blog?.id || blog?.slug) {
      try {
        const saved = JSON.parse(localStorage.getItem("bookmarked_blogs") || "[]");
        setIsBookmarked(saved.includes(blog.slug || blog.id));
      } catch {}
    }
  }, [blog]);

  const toggleBookmark = () => {
    try {
      const key = blog?.slug || blog?.id;
      if (!key) return;
      const saved = JSON.parse(localStorage.getItem("bookmarked_blogs") || "[]");
      let updated;
      if (saved.includes(key)) {
        updated = saved.filter((k) => k !== key);
        setIsBookmarked(false);
      } else {
        updated = [...saved, key];
        setIsBookmarked(true);
      }
      localStorage.setItem("bookmarked_blogs", JSON.stringify(updated));
    } catch {}
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const shareWhatsApp = () => {
    const text = encodeURIComponent(`*${blog?.title || "Pick&book Travel Guide"}*\n\nRead the full guide here: ${window.location.href}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
  };

  const scrollToHeading = (id) => {
    const el = document.getElementById(id);
    if (el) {
      const topOffset = 88;
      const elementPosition = el.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - topOffset;
      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth"
      });
      setActiveHeadingId(id);
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const formatDate = (dateString) => {
    if (!dateString) return "October 2026";
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };


  // Filter Table of Contents headings
  const filteredHeadings = useMemo(() => {
    const all = processedContent?.headings || [];
    if (!tocSearch.trim()) return all;
    const q = tocSearch.toLowerCase().trim();
    return all.filter((h) => h.text.toLowerCase().includes(q));
  }, [processedContent?.headings, tocSearch]);

  // Collect all images from the blog (Blog Cover, Subcategory, Category, embedded, gallery)
  const allImages = useMemo(() => {
    if (!blog) return [];
    const list = [];
    const seen = new Set();

    const add = (url, caption, tag) => {
      if (!url || typeof url !== "string") return;
      let clean = url.trim();
      if (!clean || clean === "-" || clean === "null" || clean === "undefined") return;
      clean = clean.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, "");
      const finalUrl = clean.startsWith("data:") || clean.startsWith("blob:") ? clean : toApiAssetUrl(clean);
      if (finalUrl && !seen.has(finalUrl)) {
        seen.add(finalUrl);
        list.push({ url: finalUrl, caption: caption || "", tag: tag || "" });
      }
    };

    // 1. Primary Blog Post Image (Cover Story from Blog Management)
    const mainImg = getBlogImageSrc(blog);
    if (mainImg) {
      add(mainImg, blog.title || "Cover Story", "Main Story");
    }

    // 2. Subcategory Image (e.g. Delhi Hotel Guide from Subcategory List)
    if (subCategoryImg) {
      const subName = blog.subCategory || blog.subCategoryName || blog.SubCategory || "Delhi Hotel Guide";
      add(
        subCategoryImg,
        `${typeof subName === "string" ? subName : "Subcategory"} Visual`,
        typeof subName === "string" ? subName : "Sub Category"
      );
    }

    // 3. Category Image (e.g. Hotel Booking from Category List)
    if (categoryImg) {
      const catName = blog.category || blog.categoryName || blog.Category || "Hotel Booking";
      add(
        categoryImg,
        `${typeof catName === "string" ? catName : "Category"} Visual`,
        typeof catName === "string" ? catName : "Category"
      );
    }

    // 4. Any embedded images from longDescription HTML
    if (Array.isArray(processedContent.embeddedImages)) {
      processedContent.embeddedImages.forEach((img) => add(img.url, img.caption, "Story Visual"));
    }

    // 5. Any extra array/gallery properties on the blog object
    const extraImages = getAllBlogImages(blog);
    extraImages.forEach((img) => add(img.url, img.caption, "Gallery"));

    return list;
  }, [blog, subCategoryImg, categoryImg, processedContent.embeddedImages]);

  // Lightbox keyboard controls
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowLeft") setLightboxIndex((prev) => (prev > 0 ? prev - 1 : allImages.length - 1));
      if (e.key === "ArrowRight") setLightboxIndex((prev) => (prev < allImages.length - 1 ? prev + 1 : 0));
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, allImages.length]);

  // Clicking any image inside the rich text content opens it in Lightbox
  const handleContentClick = (e) => {
    if (e.target && e.target.tagName === "IMG") {
      const src = e.target.src;
      const foundIdx = allImages.findIndex((img) => img.url === src);
      if (foundIdx !== -1) {
        setLightboxIndex(foundIdx);
      } else if (src) {
        setLightboxIndex(0);
      }
    }
  };

  if (loading) {
    return (
      <main className="blog-page">
        <section className="blog-shell blog-empty-state">
          <div className="editorial-loading-spinner" />
          <h3>Curating Story...</h3>
          <p>Please wait while we prepare this luxury travel guide.</p>
        </section>
      </main>
    );
  }

  if (error || !blog) {
    return (
      <main className="blog-page">
        <section className="blog-shell blog-empty-state">
          <Link className="blog-back-link" to={backPath}>
            <ArrowLeft size={18} />
            Back to Journal
          </Link>
          <h3>Article Not Available</h3>
          <p>{error || "We could not find the travel guide you are looking for."}</p>
        </section>
      </main>
    );
  }

  const categoryLower = (blog.category || "").toLowerCase();
  const isHotel = categoryLower.includes("hotel");
  const isFlight = categoryLower.includes("flight");
  const isBus = categoryLower.includes("bus");

  const ctaTitle = isHotel
    ? "Reserve Premier Delhi Hotels"
    : isFlight
    ? "Book Flight Deals to Delhi"
    : isBus
    ? "Book Comfortable Delhi Buses"
    : "Plan Your Next Getaway";

  const ctaDesc = isHotel
    ? "Handpicked premium stays across Aerocity, Connaught Place & South Delhi with exclusive Pick&book rates."
    : isFlight
    ? "Compare non-stop flights with zero hidden fees and instant booking confirmation."
    : isBus
    ? "Travel in premium sleeper buses with live tracking and flexible cancellation."
    : "Explore the best deals on flights, luxury hotels, and tailor-made holiday packages.";

  const ctaLink = isHotel ? "/hotels" : isFlight ? "/flights" : isBus ? "/buses" : "/";

  const readMinutes = Math.max(3, Math.ceil(((blog.longDescription || "").replace(/<[^>]*>/g, "").split(/\s+/).length || 800) / 220));

  return (
    <main className="blog-page">
      {/* Top Floating Reading Progress Bar */}
      <div
        className="editorial-reading-progress-bar"
        style={{ width: `${scrollProgress}%` }}
        role="progressbar"
        aria-valuenow={Math.round(scrollProgress)}
        aria-valuemin="0"
        aria-valuemax="100"
      />

      {/* Floating Quick Action Dock (Visible when scrolled) */}
      {showScrollTop && (
        <aside className="editorial-floating-dock" aria-label="Reading controls">
          <div className="floating-dock-progress" title={`${Math.round(scrollProgress)}% read`}>
            <span>{Math.round(scrollProgress)}%</span>
          </div>
          <button className="floating-dock-btn" onClick={shareWhatsApp} title="Share on WhatsApp" aria-label="Share on WhatsApp">
            <MessageCircle size={15} />
          </button>
          <button className="floating-dock-btn" onClick={copyToClipboard} title="Copy article link" aria-label="Copy link">
            {copied ? <Check size={15} color="#10b981" /> : <Link2 size={15} />}
          </button>
          <button
            className={`floating-dock-btn ${isBookmarked ? "active" : ""}`}
            onClick={toggleBookmark}
            title={isBookmarked ? "Remove Bookmark" : "Save Bookmark"}
            aria-label="Bookmark"
          >
            <Bookmark size={15} fill={isBookmarked ? "#be185d" : "none"} color={isBookmarked ? "#be185d" : "currentColor"} />
          </button>
          <button className="floating-dock-btn floating-dock-top" onClick={scrollToTop} title="Back to top" aria-label="Scroll to top">
            <ArrowUp size={15} />
          </button>
        </aside>
      )}

      <div className="blog-detail-container">
        {/* Luxury Breadcrumbs */}
        <nav className="blog-breadcrumbs" aria-label="Breadcrumbs">
          <Link to="/">Home</Link>
          <span className="breadcrumb-separator">&rsaquo;</span>
          <Link to="/blog">Stories & Guides</Link>
          <span className="breadcrumb-separator">&rsaquo;</span>
          <Link to={`/blog?category=${encodeURIComponent(blog.category || "")}`}>
            {blog.category || "Hotel Booking"}
          </Link>
          <span className="breadcrumb-separator">&rsaquo;</span>
          <span className="current">{blog.title}</span>
        </nav>

        {/* Magazine Editorial Hero Header */}
        <header className="editorial-hero-header">
          <div className="editorial-hero-left">
            <div className="editorial-pill-row">
              <span className="editorial-category-pill">
                <span className="category-pulse-dot" />
                {blog.category || "Hotel Booking Guide"}
              </span>
              {blog.subCategory && (
                <span className="editorial-subcat-pill">
                  {blog.subCategory}
                </span>
              )}
            </div>

            <h1 className="editorial-main-title">{blog.title}</h1>

            <p className="editorial-main-subtitle">
              {blog.subTitle || blog.shortDescription || "A curated insider guide to booking the best stays in Delhi with Pick&book."}
            </p>

            {/* Author & Meta Row */}
            <div className="editorial-author-meta-bar">
              <div className="editorial-author-group">
                <img
                  src={getAvatarFallback(blog.addedByName)}
                  alt={blog.addedByName || "Author"}
                  className="editorial-author-avatar"
                />
                <div className="editorial-author-details">
                  <div className="editorial-author-name-row">
                    <span className="author-name">{blog.addedByName || "Supriya Yadav"}</span>
                    <span className="verified-badge" title="Verified Travel Specialist">
                      <ShieldCheck size={13} />
                    </span>
                  </div>
                  <span className="author-title">Travel Specialist & Hotel Curator</span>
                </div>
              </div>

              <div className="editorial-meta-divider" />

              <div className="editorial-meta-stats">
                <span className="meta-stat-item" title="Published date">
                  <Calendar size={14} />
                  {formatDate(blog.publishedAtUtc || blog.createdAtUtc)}
                </span>
                <span className="meta-stat-item" title="Estimated reading time">
                  <Clock size={14} />
                  {readMinutes} min read
                </span>
              </div>
            </div>

            {/* Social Share & Action Dock */}
            <div className="editorial-action-strip">
              <span className="action-strip-label">Share Guide:</span>
              <div className="action-strip-buttons">
                <button
                  type="button"
                  className="editorial-action-btn btn-whatsapp"
                  onClick={shareWhatsApp}
                  title="Share on WhatsApp"
                  aria-label="Share on WhatsApp"
                >
                  <MessageCircle size={15} />
                  <span>WhatsApp</span>
                </button>
                <button
                  type="button"
                  className="editorial-action-btn"
                  onClick={() => window.open(`https://facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`, "_blank")}
                  title="Share on Facebook"
                  aria-label="Share on Facebook"
                >
                  <Facebook size={14} />
                </button>
                <button
                  type="button"
                  className="editorial-action-btn"
                  onClick={() => window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(blog.title)}`, "_blank")}
                  title="Share on Twitter"
                  aria-label="Share on Twitter"
                >
                  <Twitter size={14} />
                </button>
                <button
                  type="button"
                  className={`editorial-action-btn ${copied ? "copied" : ""}`}
                  onClick={copyToClipboard}
                  title="Copy Link"
                  aria-label="Copy Link"
                >
                  {copied ? <Check size={14} color="#10b981" /> : <Link2 size={14} />}
                  <span>{copied ? "Copied!" : "Copy"}</span>
                </button>
                <button
                  type="button"
                  className={`editorial-action-btn btn-bookmark ${isBookmarked ? "active" : ""}`}
                  onClick={toggleBookmark}
                  title={isBookmarked ? "Bookmarked" : "Save for later"}
                  aria-label="Bookmark Guide"
                >
                  <Bookmark size={14} fill={isBookmarked ? "#be185d" : "none"} color={isBookmarked ? "#be185d" : "currentColor"} />
                  <span>{isBookmarked ? "Saved" : "Save"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Hero Right: 3-Image Luxury Editorial Mosaic Spread */}
          <div className="editorial-hero-right">
            {allImages.length >= 3 ? (
              <div className="hero-collage-grid">
                {/* Main Large Photo (index 0: Cover Story) */}
                <div
                  className="hero-collage-main"
                  onClick={() => setLightboxIndex(0)}
                  title={`View ${allImages[0].caption || "Main Story"}`}
                >
                  <img src={allImages[0].url} alt={allImages[0].caption || blog.title} />
                  <span className="hero-collage-tag hero-tag-cover">✦ Cover Story</span>
                </div>

                {/* Right Side Stack: Photo 1 (Subcategory Room) & Photo 2 (Category Garden) */}
                <div className="hero-collage-side">
                  <div
                    className="hero-collage-thumb"
                    onClick={() => setLightboxIndex(1)}
                    title={`View ${allImages[1].caption || "Rooms & Suites"}`}
                  >
                    <img src={allImages[1].url} alt={allImages[1].caption || "Subcategory"} />
                    <span className="hero-collage-tag hero-tag-rooms">
                      ✦ {blog.subCategory || "Rooms & Suites"}
                    </span>
                  </div>

                  <div
                    className="hero-collage-thumb"
                    onClick={() => setLightboxIndex(2)}
                    title={`View ${allImages[2].caption || "Destination Grounds"}`}
                  >
                    <img src={allImages[2].url} alt={allImages[2].caption || "Category"} />
                    <span className="hero-collage-tag hero-tag-grounds">
                      ✦ {blog.category || "Hotel Booking"}
                    </span>

                    <button
                      type="button"
                      className="hero-collage-view-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLightboxIndex(0);
                      }}
                      title="View all 3 photos in full-screen gallery"
                    >
                      <Camera size={13} />
                      <span>{allImages.length} Exclusive Photos</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : allImages.length === 2 ? (
              <div className="hero-collage-grid two-photos">
                <div className="hero-collage-main" onClick={() => setLightboxIndex(0)}>
                  <img src={allImages[0].url} alt={allImages[0].caption || blog.title} />
                  <span className="hero-collage-tag hero-tag-cover">✦ Cover Story</span>
                </div>
                <div className="hero-collage-main" onClick={() => setLightboxIndex(1)}>
                  <img src={allImages[1].url} alt={allImages[1].caption || "Photo 2"} />
                  <span className="hero-collage-tag hero-tag-rooms">✦ Visual Story</span>
                </div>
              </div>
            ) : allImages.length === 1 ? (
              <div
                className="hero-single-container"
                onClick={() => setLightboxIndex(0)}
                title="Click to enlarge"
              >
                <img
                  src={allImages[0].url}
                  alt={blog.title}
                  className="detail-hero-img"
                  onError={(e) => { e.target.style.display = "none"; }}
                />
                <div className="hero-single-enlarge-badge">
                  <Maximize2 size={13} />
                  <span>Enlarge Photo</span>
                </div>
              </div>
            ) : (
              <div className="detail-hero-img detail-hero-img-placeholder">
                <span>{blog.category || "Pick&book Travel"}</span>
              </div>
            )}
          </div>
        </header>

        {/* Split Editorial Layout */}
        <div className="blog-detail-split-layout">
          {/* Main Column */}
          <div className="blog-detail-main-column">
            {/* Executive Editorial Brief (Replaces the plain dark box) */}
            <section className="editorial-executive-brief" aria-label="Executive Summary">
              <div className="brief-header-row">
                <div className="brief-badge">
                  <Sparkles size={15} className="brief-sparkle-icon" />
                  <span>Traveler's Essential Brief</span>
                </div>
                <span className="brief-reading-tag">
                  <Clock size={12} /> {readMinutes} min comprehensive read
                </span>
              </div>

              <h2 className="brief-title">Why This Guide Matters for Your Delhi Stay</h2>

              <p className="brief-summary-text">
                {blog.shortDescription || "Discover the best areas to stay in Delhi, handpicked hotel booking tips, neighborhood safety insights, and how to get the most value out of your reservation with Pick&book."}
              </p>

              <div className="brief-takeaways-grid">
                <div className="brief-takeaway-card">
                  <div className="takeaway-icon-circle"><Check size={13} /></div>
                  <div className="takeaway-text">
                    <strong>Neighborhood Strategy</strong>
                    <span>Best zones: Aerocity (transit), CP (central), South Delhi (culture & cafes).</span>
                  </div>
                </div>
                <div className="brief-takeaway-card">
                  <div className="takeaway-icon-circle"><Check size={13} /></div>
                  <div className="takeaway-text">
                    <strong>Value & Transparency</strong>
                    <span>Lock in verified properties with instant confirmation & zero hidden surcharges.</span>
                  </div>
                </div>
                <div className="brief-takeaway-card">
                  <div className="takeaway-icon-circle"><Check size={13} /></div>
                  <div className="takeaway-text">
                    <strong>Concierge Booking</strong>
                    <span>Exclusive Pick&book perks, flexible check-in, and 24/7 traveller support.</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Subtle Luxury Hairline Ornament Divider (Replaces harsh red 'x') */}
            <div className="editorial-ornament-divider" aria-hidden="true">
              <span className="ornament-line" />
              <span className="ornament-diamond">✦</span>
              <span className="ornament-line" />
            </div>

            {/* Rich Article Body with Luxury Typography & Tables */}
            <article className="blog-detail-content-card">
              <div
                className="blog-rich-content"
                onClick={handleContentClick}
                dangerouslySetInnerHTML={{ __html: processedContent.html || blog.longDescription }}
              />
            </article>

            {/* Bottom Story Photo Gallery (Shows All 3 Photos) */}
            {allImages.length > 1 && (
              <section className="blog-gallery-section" aria-label="Story Photo Gallery">
                <div className="blog-gallery-header">
                  <div className="blog-gallery-title-wrap">
                    <Camera size={19} className="blog-gallery-sparkle" />
                    <h3 className="blog-gallery-title">Story Photo Gallery</h3>
                  </div>
                  <span className="blog-gallery-count">{allImages.length} Curated Photos</span>
                </div>
                <div className="blog-gallery-grid">
                  {allImages.map((imgObj, idx) => (
                    <div
                      key={idx}
                      className="blog-gallery-card"
                      onClick={() => setLightboxIndex(idx)}
                      title={imgObj.caption || "Click to enlarge photo"}
                    >
                      <img
                        src={imgObj.url}
                        alt={imgObj.caption || `${blog.title} - photo ${idx + 1}`}
                        className="blog-gallery-card-img"
                        loading="lazy"
                        onError={(e) => {
                          const card = e.currentTarget.closest(".blog-gallery-card");
                          if (card) card.style.display = "none";
                        }}
                      />
                      <div className="blog-gallery-card-overlay">
                        <Maximize2 size={16} />
                        <span>{imgObj.tag ? `${imgObj.tag} • View` : "View Fullscreen"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Sticky Sidebar Column */}
          <aside className="blog-detail-sidebar-column">
            {/* Table of Contents with Real-Time ScrollSpy & Search Filter */}
            {processedContent.headings && processedContent.headings.length > 0 && (
              <div className="sidebar-widget-card toc-widget-card">
                <div className="toc-header-row">
                  <div className="toc-title-group">
                    <BookOpen size={16} className="toc-title-icon" />
                    <h4 className="widget-header-title">In This Guide</h4>
                  </div>
                  <span className="toc-counter-pill">{processedContent.headings.length} topics</span>
                </div>

                {/* Instant Filter Search for 40+ topics */}
                {processedContent.headings.length > 6 && (
                  <div className="toc-search-container">
                    <Search size={13} className="toc-search-icon" />
                    <input
                      type="text"
                      className="toc-search-input"
                      placeholder="Filter topics..."
                      value={tocSearch}
                      onChange={(e) => setTocSearch(e.target.value)}
                    />
                    {tocSearch && (
                      <button className="toc-search-clear" onClick={() => setTocSearch("")}>×</button>
                    )}
                  </div>
                )}

                {/* Scrollable Container with Custom Scrollbar */}
                <div className="toc-items-container">
                  {(tocExpanded ? filteredHeadings : filteredHeadings.slice(0, 10)).map((heading, idx) => {
                    const isActive = activeHeadingId === heading.id;
                    return (
                      <button
                        key={heading.id}
                        type="button"
                        className={`toc-item-btn ${isActive ? "active" : ""} ${heading.level === "h3" ? "level-sub" : ""}`}
                        onClick={() => scrollToHeading(heading.id)}
                        title={heading.text}
                      >
                        <span className="toc-item-number">{String(idx + 1).padStart(2, "0")}</span>
                        <span className="toc-item-text">{heading.text}</span>
                        {isActive && <span className="toc-active-indicator" />}
                      </button>
                    );
                  })}
                </div>

                {/* Expand / Collapse Button if many topics */}
                {filteredHeadings.length > 10 && (
                  <button
                    type="button"
                    className="toc-toggle-more-btn"
                    onClick={() => setTocExpanded(!tocExpanded)}
                  >
                    {tocExpanded
                      ? "Collapse to Key Topics"
                      : `View All ${filteredHeadings.length} Topics ↓`}
                  </button>
                )}
              </div>
            )}

            {/* Author Profile Card */}
            <div className="sidebar-widget-card author-widget-card">
              <div className="author-card-content">
                <div className="author-avatar-wrapper">
                  <img
                    src={getAvatarFallback(blog.addedByName)}
                    alt={blog.addedByName || "Author"}
                    className="author-widget-avatar"
                  />
                  <span className="author-verified-dot" title="Verified Author">
                    <Check size={11} color="#ffffff" strokeWidth={3} />
                  </span>
                </div>
                <h5 className="author-widget-name">{blog.addedByName || "Supriya Yadav"}</h5>
                <span className="author-widget-role">Verified Travel Specialist</span>
                <p className="author-widget-bio">
                  Curates top destination stays and luxury booking itineraries across India. Dedicated to helping travellers book with confidence.
                </p>
                <div className="author-widget-socials">
                  <button type="button" className="widget-social-icon" onClick={shareWhatsApp} title="Share via WhatsApp">
                    <MessageCircle size={14} />
                  </button>
                  <button type="button" className="widget-social-icon" onClick={() => window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(window.location.href)}`, "_blank")} title="Twitter">
                    <Twitter size={14} />
                  </button>
                  <button type="button" className="widget-social-icon" onClick={copyToClipboard} title="Copy link">
                    <Link2 size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* High-Converting Luxury Hotel Planner Card */}
            <div className="sidebar-widget-card plan-adventure-cta-card">
              <div className="plan-badge-strip">
                <span className="plan-rating-badge">⭐ 4.9/5 Rating</span>
                <span className="plan-guarantee-badge">Best Rate Guarantee</span>
              </div>
              <h4 className="cta-heading-title">{ctaTitle}</h4>
              <p className="cta-description-text">{ctaDesc}</p>

              <div className="cta-perks-list">
                <div className="cta-perk-item">✓ Instant Room Confirmation</div>
                <div className="cta-perk-item">✓ Verified Guest Ratings</div>
                <div className="cta-perk-item">✓ 24/7 Dedicated Concierge</div>
              </div>

              <Link to={ctaLink} className="cta-explore-button">
                <span>Explore Delhi Hotels</span>
                <ArrowRight size={15} />
              </Link>
            </div>

            {/* Related Stories Widget */}
            {relatedBlogs.length > 0 && (
              <div className="sidebar-widget-card related-posts-widget-card">
                <h4 className="widget-header-title">More Travel Stories</h4>
                <div className="related-posts-list">
                  {relatedBlogs.map((rBlog) => (
                    <Link key={rBlog.id || rBlog.slug} to={`/blog/${rBlog.slug}`} className="related-post-item-row">
                      {getBlogImageSrc(rBlog) ? (
                        <img
                          src={getBlogImageSrc(rBlog)}
                          alt={rBlog.title}
                          className="related-item-img"
                          onError={(e) => { e.target.style.display = "none"; }}
                        />
                      ) : (
                        <div className="related-item-img related-item-img-placeholder">
                          <span>{rBlog.category?.[0] || "T"}</span>
                        </div>
                      )}
                      <div className="related-item-content">
                        <span className="related-item-category">{rBlog.category || "Hotels"}</span>
                        <h5 className="related-item-title">{rBlog.title}</h5>
                        <div className="related-item-meta-row">
                          <span>{formatDate(rBlog.publishedAtUtc || rBlog.createdAtUtc)}</span>
                          <span>&bull;</span>
                          <span>5 min read</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Daily Travel Dispatch Newsletter */}
            <div className="sidebar-widget-card newsletter-widget-card">
              <div className="newsletter-icon-circle">
                <Sparkles size={16} />
              </div>
              <h4 className="widget-header-title">The Pick&book Dispatch</h4>
              <p className="newsletter-desc">
                Receive curated travel secret guides, hotel flash deals, and booking promos directly to your inbox.
              </p>
              <form onSubmit={(e) => { e.preventDefault(); alert("Welcome to The Pick&book Dispatch!"); }} className="newsletter-form-group">
                <input type="email" placeholder="Your best email..." required className="newsletter-form-input" />
                <button type="submit" className="newsletter-form-submit-btn">
                  Join 45,000+ Travellers
                </button>
              </form>
            </div>
          </aside>
        </div>
      </div>

      {/* Full-Screen Interactive Lightbox Modal */}
      {lightboxIndex !== null && allImages[lightboxIndex] && (
        <div className="blog-lightbox-backdrop" onClick={() => setLightboxIndex(null)}>
          <div className="blog-lightbox-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="blog-lightbox-close"
              onClick={() => setLightboxIndex(null)}
              aria-label="Close photo"
            >
              <X size={22} />
            </button>

            {allImages.length > 1 && (
              <>
                <button
                  type="button"
                  className="blog-lightbox-nav blog-lightbox-prev"
                  onClick={() => setLightboxIndex((prev) => (prev > 0 ? prev - 1 : allImages.length - 1))}
                  aria-label="Previous photo"
                >
                  <ChevronLeft size={28} />
                </button>
                <button
                  type="button"
                  className="blog-lightbox-nav blog-lightbox-next"
                  onClick={() => setLightboxIndex((prev) => (prev < allImages.length - 1 ? prev + 1 : 0))}
                  aria-label="Next photo"
                >
                  <ChevronRight size={28} />
                </button>
              </>
            )}

            <img
              src={allImages[lightboxIndex].url}
              alt={allImages[lightboxIndex].caption || blog.title}
              className="blog-lightbox-img"
            />

            <div className="blog-lightbox-footer">
              <span className="blog-lightbox-counter">
                Photo {lightboxIndex + 1} of {allImages.length} {allImages[lightboxIndex].tag ? `• ${allImages[lightboxIndex].tag}` : ""}
              </span>
              {allImages[lightboxIndex].caption && (
                <span className="blog-lightbox-caption">
                  {allImages[lightboxIndex].caption}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
