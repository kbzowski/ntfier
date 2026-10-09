import { createContext, useContext } from "react";

/** The "show images" setting: remote images (markdown, external attachments, icons). */
const ShowImagesContext = createContext(true);

export const ShowImagesProvider = ShowImagesContext.Provider;

export function useShowImages(): boolean {
	return useContext(ShowImagesContext);
}
