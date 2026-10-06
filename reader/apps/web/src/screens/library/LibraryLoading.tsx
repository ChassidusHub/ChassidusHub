import { useTranslation } from '../../i18n/useLanguage';

/** While a part of the catalog (the library, the works, a sefer's chapters) is on its way. */
export function LibraryLoading() {
  const { t } = useTranslation();
  return (
    <div className="library-loading" role="status">
      <span className="pdf-loading-spinner" aria-hidden />
      <span>{t.readerLoading}</span>
    </div>
  );
}
