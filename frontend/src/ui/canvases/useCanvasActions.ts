import { reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useDialog, useMessage } from 'naive-ui'
import { useCanvasMutations } from '@/api/canvases'
import { ApiError } from '@/api/client'
import { useApiErrorNotifier } from '@/ui/useApiErrorNotifier'
import type { CanvasNameDialogMode } from './CanvasNameDialog.vue'

/** The fields an action needs; satisfied by both CanvasSummary and Canvas. */
export interface CanvasRef {
  id: string
  title: string
  description: string
  version: number
}

/**
 * Create / rename / duplicate / delete canvases, with dialogs and error notifications.
 * The page renders <CanvasNameDialog> bound to `dialog` and calls `submitDialog` on submit.
 */
export function useCanvasActions(options: { onDeleted?: (id: string) => void } = {}) {
  const router = useRouter()
  const message = useMessage()
  const confirm = useDialog()
  const notifyError = useApiErrorNotifier()
  const mutations = useCanvasMutations()

  const dialog = reactive({
    show: false,
    mode: 'create' as CanvasNameDialogMode,
    target: null as CanvasRef | null,
    initialTitle: '',
    initialDescription: '',
    loading: false,
  })

  function open(
    mode: CanvasNameDialogMode,
    target: CanvasRef | null,
    title = '',
    description = '',
  ) {
    Object.assign(dialog, {
      show: true,
      mode,
      target,
      initialTitle: title,
      initialDescription: description,
      loading: false,
    })
  }

  const startCreate = () => open('create', null)
  const startRename = (canvas: CanvasRef) =>
    open('rename', canvas, canvas.title, canvas.description)
  const startDuplicate = (canvas: CanvasRef) =>
    open('duplicate', canvas, `Copy of ${canvas.title}`.slice(0, 120))

  async function submitDialog(value: { title: string; description: string }): Promise<void> {
    dialog.loading = true
    try {
      if (dialog.mode === 'create') {
        const canvas = await mutations.create.mutateAsync(value)
        dialog.show = false
        await router.push({ name: 'canvas', params: { id: canvas.id } })
      } else if (dialog.mode === 'rename' && dialog.target) {
        await mutations.rename.mutateAsync({
          id: dialog.target.id,
          version: dialog.target.version,
          ...value,
        })
        dialog.show = false
        message.success('Canvas renamed')
      } else if (dialog.mode === 'duplicate' && dialog.target) {
        const copy = await mutations.duplicate.mutateAsync({
          id: dialog.target.id,
          title: value.title,
        })
        dialog.show = false
        message.success('Canvas duplicated')
        await router.push({ name: 'canvas', params: { id: copy.id } })
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VERSION_CONFLICT') {
        dialog.show = false
        notifyError('Someone else changed this canvas', 'It has been reloaded. Please try again.')
      } else {
        notifyError('Could not save the canvas', error)
      }
    } finally {
      dialog.loading = false
    }
  }

  function confirmDelete(canvas: CanvasRef): void {
    confirm.warning({
      title: 'Delete canvas?',
      content: `“${canvas.title}” will be deleted for everyone it is shared with. An admin can restore it.`,
      positiveText: 'Delete',
      negativeText: 'Cancel',
      onPositiveClick: async () => {
        try {
          await mutations.remove.mutateAsync(canvas.id)
          message.success('Canvas deleted')
          options.onDeleted?.(canvas.id)
        } catch (error) {
          notifyError('Could not delete the canvas', error)
        }
      },
    })
  }

  return { dialog, startCreate, startRename, startDuplicate, submitDialog, confirmDelete }
}
