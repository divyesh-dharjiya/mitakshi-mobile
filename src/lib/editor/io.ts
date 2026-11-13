import { addBatchFiles, openBatch } from './batch';
import { loadPhoto } from './photo';
import type { PhotoSource } from './store';

/**
 * Opening files from the OS. The file input is created on the fly and clicked inside the user's
 * gesture, which browsers require for the picker to open.
 */
export function pickFiles(onFiles: (files: File[]) => void, multiple = false) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = multiple;
  input.style.display = 'none';
  input.onchange = () => {
    onFiles([...(input.files ?? [])]);
    input.remove();
  };
  document.body.append(input);
  input.click();
}

/** Let the user choose one photo. */
export const pickOne = (onPhoto: (source: PhotoSource, name: string) => void) => pickFiles(([file]) => file && onPhoto(file, file.name));

export const pickPhoto = () => pickOne((file, name) => void loadPhoto(file, name));

export const pickBatchPhotos = () => {
  openBatch();
  pickFiles(addBatchFiles, true);
};
