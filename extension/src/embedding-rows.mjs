// Convert Transformers.js pooled Tensor output to one vector per input text.
// Transformers versions expose tensors via dims/data, not necessarily output[i].
export function embeddingRows(output, count) {
 if (!Number.isInteger(count) || count < 0) throw Error("Invalid embedding count");
 if (count === 0) return [];
 if (output?.data && Array.isArray(output.dims)) {
  const flat = output.data;
  const width = count === 1 && output.dims.length === 1
   ? flat.length : output.dims.at(-1);
  if (!Number.isInteger(width) || width <= 0 || flat.length !== count * width) {
   throw Error("Unexpected embedding tensor dimensions: " + JSON.stringify(output.dims));
  }
  return Array.from({ length: count }, (_, i) =>
   Array.from(flat.subarray ? flat.subarray(i * width, (i + 1) * width)
    : flat.slice(i * width, (i + 1) * width)));
 }
 if (Array.isArray(output) && output.length === count) {
  return output.map(item => Array.from(item?.data || item));
 }
 throw Error("Unexpected model embedding output format");
}
