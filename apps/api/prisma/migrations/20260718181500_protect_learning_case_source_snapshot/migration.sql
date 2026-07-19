-- A closed draft case releases its active foreign key so an import can be
-- retired, but its stable source id and SHA remain immutable provenance.
CREATE FUNCTION "prevent_parser_learning_case_source_snapshot_update"()
RETURNS trigger AS $$
BEGIN
  IF NEW."source_import_reference_id" IS DISTINCT FROM OLD."source_import_reference_id"
     OR NEW."source_file_sha256" IS DISTINCT FROM OLD."source_file_sha256" THEN
    RAISE EXCEPTION 'PARSER_LEARNING_SOURCE_SNAPSHOT_IMMUTABLE'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "parser_learning_cases_source_snapshot_immutable"
BEFORE UPDATE ON "parser_learning_cases"
FOR EACH ROW EXECUTE FUNCTION "prevent_parser_learning_case_source_snapshot_update"();
