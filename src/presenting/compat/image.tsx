/**
 * next/image compat shim for the presenting sub-tree.
 * Replaces Next.js `<Image>` with a plain `<img>` element.
 */

import React from "react";

export interface NextImageCompatProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
	src: string;
	fill?: boolean;
	priority?: boolean;
	quality?: number;
}

const NextImageCompat = React.forwardRef<HTMLImageElement, NextImageCompatProps>(
	({ src, alt = "", className, style, fill, loading, onError, onLoad, width, height, ...rest }, ref) => {
		const mergedStyle: React.CSSProperties = fill
			? {
					objectFit: "cover",
					width: "100%",
					height: "100%",
					position: "absolute",
					inset: 0,
					...style,
				}
			: style ?? {};

		// Ignore next/image-only props
		void rest;

		return (
			<img
				ref={ref}
				src={src}
				alt={alt}
				className={className}
				style={mergedStyle}
				loading={loading ?? "lazy"}
				onError={onError}
				onLoad={onLoad}
				{...(fill ? {} : { width: width as number, height: height as number })}
			/>
		);
	},
);
NextImageCompat.displayName = "Image";

export default NextImageCompat;
