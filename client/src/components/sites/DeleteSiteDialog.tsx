import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/hooks/useToast';
import { ApiError } from '@/services/api';
import * as siteService from '@/services/site.service';

import type { Site } from '@/types/api';

/**
 * Deletion confirmation (SPEC §5).
 *
 * Deleting a site also deletes its entire history, which is not obvious from
 * the button — so the dialog says so explicitly rather than asking a bare "are
 * you sure". The action is irreversible and there is no undo, so the wording
 * has to carry the weight.
 */
export function DeleteSiteDialog({
  site,
  onClose,
  onDeleted,
}: {
  site: Site | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const toast = useToast();

  const handleDelete = async () => {
    if (!site) return;
    setIsDeleting(true);

    try {
      await siteService.deleteSite(site.id);
      onDeleted(site.id);
      toast.success(`${site.name} deleted`);
      onClose();
    } catch (caught) {
      toast.error(
        'Could not delete this website',
        caught instanceof ApiError ? caught.message : 'Please try again',
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal
      isOpen={site !== null}
      onClose={onClose}
      title={`Delete ${site?.name ?? 'website'}?`}
      size="sm"
      footer={
        <>
          <Button type="button" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void handleDelete()} isLoading={isDeleting}>
            Delete website
          </Button>
        </>
      }
    >
      <p className="text-sm text-secondary">
        This permanently removes <span className="font-medium">{site?.name}</span> along with all
        of its health checks, incidents, and notifications. This cannot be undone.
      </p>

      <p className="mt-3 text-sm text-muted">
        To stop checks without losing the history, pause monitoring instead.
      </p>
    </Modal>
  );
}
