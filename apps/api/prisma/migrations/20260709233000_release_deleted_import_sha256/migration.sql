UPDATE import_files
SET file_sha256 = CONCAT('deleted:', id, ':', file_sha256)
WHERE deleted_at IS NOT NULL
  AND file_sha256 NOT LIKE CONCAT('deleted:', id, ':%');
