import { atScale } from "../utils/uiScale";
import { useAttachmentSrc } from "../hooks/useAttachmentSrc";
import Lightbox, { LIGHTBOX_HEADER } from "./Lightbox";

interface ImageLightboxProps {
  /** As the note holds it; resolved here. */
  src: string;
  alt?: string;
  /** The file's name, shown above the picture; none for inline data. */
  name?: string;
  onClose: () => void;
}

/** An image at full size: fitted inside the window and never enlarged. */
export default function ImageLightbox({ src, alt, name, onClose }: ImageLightboxProps) {
  const { url, next, loaded } = useAttachmentSrc(src);
  if (!src) return null;
  return (
    <Lightbox label={name ? `Image: ${name}` : "Image"} name={name} onClose={onClose}>
      <img
        src={url}
        onError={next}
        onLoad={loaded}
        alt={alt || ""}
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "block",
          maxWidth: "100%",
          maxHeight: atScale(`100vh - ${LIGHTBOX_HEADER * 2}px`),
          objectFit: "contain",
          borderRadius: 4,
        }}
      />
    </Lightbox>
  );
}
