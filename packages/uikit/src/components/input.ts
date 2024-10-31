import { FlexNode, FlexNodeState, YogaProperties, createFlexNodeState } from '../flex/index.js'
import { createHoverPropertyTransformers, setupCursorCleanup } from '../hover.js'
import { computedIsClipped } from '../clipping.js'
import { ScrollbarProperties } from '../scroll.js'
import { WithAllAliases } from '../properties/alias.js'
import { PanelProperties, createInstancedPanel } from '../panel/instanced-panel.js'
import { TransformProperties, applyTransform, computedTransformMatrix } from '../transform.js'
import {
  AllOptionalProperties,
  WithClasses,
  WithReactive,
  computedInheritableProperty,
  computedNonInheritableProperty,
  traverseProperties,
} from '../properties/index.js'
import { createResponsivePropertyTransformers } from '../responsive.js'
import { ElementType, ZIndexProperties, computedOrderInfo } from '../order.js'
import { createActivePropertyTransfomers } from '../active.js'
import { Signal, computed, effect, signal } from '@preact/signals-core'
import {
  UpdateMatrixWorldProperties,
  VisibilityProperties,
  WithConditionals,
  computedGlobalMatrix,
  computedHandlers,
  computedIsVisible,
  computedMergedProperties,
  createNode,
  setupInteractableDecendant,
  setupMatrixWorldUpdate,
  setupPointerEvents,
} from './utils.js'
import { Initializers, readReactive } from '../utils.js'
import { Listeners, setupLayoutListeners, setupClippedListeners } from '../listeners.js'
import { Object3DRef, ParentContext } from '../context.js'
import { PanelGroupProperties, computedPanelGroupDependencies } from '../panel/instanced-panel-group.js'
import { createInteractionPanel } from '../panel/instanced-panel-mesh.js'
import { EventHandlers } from '../events.js'
import { Vector2Tuple, Vector2, Vector3Tuple } from 'three'
import { CaretProperties, createCaret } from '../caret.js'
import { SelectionBoxes, SelectionProperties, createSelection } from '../selection.js'
import { WithFocus, createFocusPropertyTransformers } from '../focus.js'
import {
  FontFamilies,
  InstancedText,
  InstancedTextProperties,
  computedFont,
  computedGylphGroupDependencies,
  createInstancedText,
} from '../text/index.js'
import { darkPropertyTransformers } from '../dark.js'
import { getDefaultPanelMaterialConfig } from '../panel/index.js'

export type InheritableInputProperties = WithClasses<
  WithFocus<
    WithConditionals<
      WithAllAliases<
        WithReactive<
          YogaProperties &
            PanelProperties &
            ZIndexProperties &
            TransformProperties &
            ScrollbarProperties &
            CaretProperties &
            SelectionProperties &
            PanelGroupProperties &
            InstancedTextProperties &
            DisabledProperties &
            VisibilityProperties &
            UpdateMatrixWorldProperties
        >
      >
    >
  >
>

export type DisabledProperties = {
  disabled?: boolean
}

const cancelSet = new Set<PointerEvent>()

function cancelBlur(event: PointerEvent) {
  cancelSet.add(event)
}

export const canvasInputProps = {
  onPointerDown: (e: { nativeEvent: any; preventDefault: () => void }) => {
    if (!(document.activeElement instanceof HTMLElement)) {
      return
    }
    if (!cancelSet.has(e.nativeEvent)) {
      return
    }
    cancelSet.delete(e.nativeEvent)
    e.preventDefault()
  },
}

export type InputType = 'text' | 'password'

export type InputProperties = InheritableInputProperties &
  Listeners & {
    onValueChange?: (value: string) => void
  } & WithReactive<{
    type?: InputType
    value?: string
    tabIndex?: number
    disabled?: boolean
  }> & {
    multiline?: boolean
    defaultValue?: string
  }

export function createInput(
  parentCtx: ParentContext,
  fontFamilies: Signal<FontFamilies | undefined>,
  style: Signal<InputProperties | undefined>,
  properties: Signal<InputProperties | undefined>,
  defaultProperties: Signal<AllOptionalProperties | undefined>,
  object: Object3DRef,
) {
  const hoveredSignal = signal<Array<number>>([])
  const activeSignal = signal<Array<number>>([])
  const hasFocusSignal = signal<boolean>(false)
  const initializers: Initializers = []
  setupCursorCleanup(hoveredSignal, initializers)

  const mergedProperties = computedMergedProperties(
    style,
    properties,
    defaultProperties,
    {
      ...darkPropertyTransformers,
      ...createResponsivePropertyTransformers(parentCtx.root.size),
      ...createHoverPropertyTransformers(hoveredSignal),
      ...createActivePropertyTransfomers(activeSignal),
      ...createFocusPropertyTransformers(hasFocusSignal),
    },
    undefined,
    (m) => {
      traverseProperties(style.value, properties.value, defaultProperties.value, (p) => {
        m.add('caretOpacity', p.opacity)
        m.add('caretColor', p.color)
      })
    },
  )

  const flexState = createFlexNodeState()
  const nodeSignal = signal<FlexNode | undefined>(undefined)
  createNode(nodeSignal, flexState, parentCtx, mergedProperties, object, false, initializers)

  const transformMatrix = computedTransformMatrix(mergedProperties, flexState, parentCtx.root.pixelSize)
  applyTransform(parentCtx.root, object, transformMatrix, initializers)

  const globalMatrix = computedGlobalMatrix(parentCtx.childrenMatrix, transformMatrix)

  const isClipped = computedIsClipped(parentCtx.clippingRect, globalMatrix, flexState.size, parentCtx.root.pixelSize)
  const isVisible = computedIsVisible(flexState, isClipped, mergedProperties)

  const groupDeps = computedPanelGroupDependencies(mergedProperties)
  const backgroundOrderInfo = computedOrderInfo(mergedProperties, ElementType.Panel, groupDeps, parentCtx.orderInfo)
  initializers.push((subscriptions) =>
    createInstancedPanel(
      mergedProperties,
      backgroundOrderInfo,
      groupDeps,
      parentCtx.root.panelGroupManager,
      globalMatrix,
      flexState.size,
      undefined,
      flexState.borderInset,
      parentCtx.clippingRect,
      isVisible,
      getDefaultPanelMaterialConfig(),
      subscriptions,
    ),
  )

  const instancedTextRef: { current?: InstancedText } = {}
  const selectionBoxes = signal<SelectionBoxes>([])
  const caretPosition = signal<Vector3Tuple | undefined>(undefined)
  const selectionRange = signal<Vector2Tuple | undefined>(undefined)
  createCaret(
    mergedProperties,
    globalMatrix,
    caretPosition,
    isVisible,
    backgroundOrderInfo,
    parentCtx.clippingRect,
    parentCtx.root.panelGroupManager,
    initializers,
  )
  const selectionOrderInfo = createSelection(
    mergedProperties,
    globalMatrix,
    selectionBoxes,
    isVisible,
    backgroundOrderInfo,
    parentCtx.clippingRect,
    parentCtx.root.panelGroupManager,
    initializers,
  )

  const fontSignal = computedFont(mergedProperties, fontFamilies, parentCtx.root.renderer, initializers)
  const orderInfo = computedOrderInfo(
    undefined,
    ElementType.Text,
    computedGylphGroupDependencies(fontSignal),
    selectionOrderInfo,
  )
  const defaultValue = style.peek()?.defaultValue ?? properties.peek()?.defaultValue
  const writeValue =
    style.peek()?.value == null && properties.peek()?.value == null ? signal(defaultValue ?? '') : undefined
  const valueSignal = computed(
    () => writeValue?.value ?? readReactive(style.value?.value) ?? readReactive(properties.value?.value) ?? '',
  )
  const type = computedNonInheritableProperty<InputType>(style, properties, 'type', 'text')
  const displayValueSignal = computed(() =>
    type.value === 'text' ? valueSignal.value : '*'.repeat(valueSignal.value.length ?? 0),
  )
  const multiline = style.peek()?.multiline ?? properties.peek()?.multiline ?? false
  const customLayouting = createInstancedText(
    mergedProperties,
    displayValueSignal,
    globalMatrix,
    nodeSignal,
    flexState,
    isVisible,
    parentCtx.clippingRect,
    orderInfo,
    fontSignal,
    parentCtx.root.gylphGroupManager,
    selectionRange,
    selectionBoxes,
    caretPosition,
    instancedTextRef,
    initializers,
    multiline ? 'break-word' : 'keep-all',
  )
  initializers.push(() => effect(() => nodeSignal.value?.setCustomLayouting(customLayouting.value)))

  const interactionPanel = createInteractionPanel(
    backgroundOrderInfo,
    parentCtx.root,
    parentCtx.clippingRect,
    flexState.size,
    globalMatrix,
    initializers,
  )
  setupPointerEvents(mergedProperties, interactionPanel, initializers)
  setupInteractableDecendant(parentCtx.root, interactionPanel, initializers)

  const updateMatrixWorld = computedInheritableProperty(mergedProperties, 'updateMatrixWorld', false)
  setupMatrixWorldUpdate(updateMatrixWorld, false, object, parentCtx.root, globalMatrix, initializers, false)
  setupMatrixWorldUpdate(updateMatrixWorld, false, interactionPanel, parentCtx.root, globalMatrix, initializers, true)

  setupLayoutListeners(style, properties, flexState.size, initializers)
  setupClippedListeners(style, properties, isClipped, initializers)

  const disabled = computedNonInheritableProperty(style, properties, 'disabled', false)

  const element = createHtmlInputElement(
    valueSignal,
    selectionRange,
    (newValue) => {
      if (writeValue != null) {
        writeValue.value = newValue
      }
      style.peek()?.onValueChange?.(newValue)
      properties.peek()?.onValueChange?.(newValue)
    },
    multiline,
    type,
    disabled,
    computedNonInheritableProperty(style, properties, 'tabIndex', 0),
    initializers,
  )
  const focus = (start?: number, end?: number, direction?: 'forward' | 'backward' | 'none') => {
    const inputElement = element.peek()
    if (inputElement == null) {
      return
    }
    if (!hasFocusSignal.peek()) {
      inputElement.focus()
    }
    if (start != null && end != null) {
      inputElement.setSelectionRange(start, end, direction)
    }
    selectionRange.value = [inputElement.selectionStart ?? 0, inputElement.selectionEnd ?? 0]
  }
  const blur = () => {
    const inputElement = element.peek()
    if (inputElement == null) {
      return
    }
    inputElement.blur()
    selectionRange.value = undefined
  }
  setupUpdateHasFocus(element, hasFocusSignal, initializers, (hasFocus: boolean) => {
    properties.peek()?.onFocusChange?.(hasFocus)
    style.peek()?.onFocusChange?.(hasFocus)
  })
  const selectionHandlers = computedSelectionHandlers(flexState, instancedTextRef, focus, disabled)

  return Object.assign(flexState, {
    isClipped,
    isVisible,
    mergedProperties,
    valueSignal,
    focus,
    blur,
    root: parentCtx.root,
    element,
    node: nodeSignal,
    interactionPanel,
    handlers: computedHandlers(
      style,
      properties,
      defaultProperties,
      hoveredSignal,
      activeSignal,
      selectionHandlers,
      'text',
    ),
    initializers,
  })
}

export function computedSelectionHandlers(
  flexState: FlexNodeState,
  instancedTextRef: { current?: InstancedText },
  focus: (start?: number, end?: number, direction?: 'forward' | 'backward' | 'none') => void,
  disabled: Signal<boolean>,
) {
  return computed<EventHandlers | undefined>(() => {
    if (disabled.value) {
      return undefined
    }
    let startCharIndex: number | undefined
    return {
      onPointerDown: (e) => {
        if (e.defaultPrevented || e.uv == null || instancedTextRef.current == null) {
          return
        }
        cancelBlur(e.nativeEvent)
        e.stopPropagation?.()
        const charIndex = uvToCharIndex(flexState, e.uv, instancedTextRef.current)
        startCharIndex = charIndex

        setTimeout(() => focus(charIndex, charIndex))
      },
      onPointerUp: (e) => {
        startCharIndex = undefined
      },
      onPointerLeave: (e) => {
        startCharIndex = undefined
      },
      onPointerMove: (e) => {
        if (startCharIndex == null || e.uv == null || instancedTextRef.current == null) {
          return
        }
        e.stopPropagation?.()
        const charIndex = uvToCharIndex(flexState, e.uv, instancedTextRef.current)

        const start = Math.min(startCharIndex, charIndex)
        const end = Math.max(startCharIndex, charIndex)
        const direction = startCharIndex < charIndex ? 'forward' : 'backward'

        setTimeout(() => focus(start, end, direction))
      },
    }
  })
}

export function createHtmlInputElement(
  value: Signal<string>,
  selectionRange: Signal<Vector2Tuple | undefined>,
  onChange: (value: string) => void,
  multiline: boolean,
  type: Signal<InputType>,
  disabled: Signal<boolean>,
  tabIndex: Signal<number>,
  initializers: Initializers,
) {
  const elementSignal = signal<HTMLInputElement | HTMLTextAreaElement | undefined>(undefined)
  initializers.push((subscriptions) => {
    const element = document.createElement(multiline ? 'textarea' : 'input')
    const style = element.style
    style.setProperty('position', 'absolute')
    style.setProperty('left', '-1000vw')
    style.setProperty('top', '0')
    style.setProperty('pointerEvents', 'none')
    style.setProperty('opacity', '0')
    element.addEventListener('input', () => {
      onChange?.(element.value)
      updateSelection()
    })
    const updateSelection = () => {
      const { selectionStart, selectionEnd } = element
      if (selectionStart == null || selectionEnd == null) {
        selectionRange.value = undefined
        return
      }
      const current = selectionRange.peek()
      if (current != null && current[0] === selectionStart && current[1] === selectionEnd) {
        return
      }
      selectionRange.value = [selectionStart, selectionEnd]
    }
    element.addEventListener('keydown', updateSelection)
    element.addEventListener('keyup', updateSelection)
    element.addEventListener('blur', () => (selectionRange.value = undefined))
    document.body.appendChild(element)
    elementSignal.value = element
    subscriptions.push(
      () => {
        elementSignal.value = undefined
        element.remove()
      },
      effect(() => (element.value = value.value)),
      effect(() => (element.disabled = disabled.value)),
      effect(() => (element.tabIndex = tabIndex.value)),
      effect(() => element.setAttribute('type', type.value)),
    )
    return subscriptions
  })

  return elementSignal
}

function setupUpdateHasFocus(
  elementSignal: Signal<HTMLElement | undefined>,
  hasFocusSignal: Signal<boolean>,
  initializers: Initializers,
  onFocusChange: (focus: boolean) => void,
) {
  initializers.push(() =>
    effect(() => {
      const element = elementSignal.value
      if (element == null) {
        return
      }
      hasFocusSignal.value = document.activeElement === element
      const listener = () => {
        const hasFocus = document.activeElement === element
        if (hasFocus == hasFocusSignal.value) {
          return
        }
        hasFocusSignal.value = hasFocus
        onFocusChange(hasFocus)
      }
      element.addEventListener('focus', listener)
      element.addEventListener('blur', listener)
      return () => {
        element.removeEventListener('focus', listener)
        element.removeEventListener('blur', listener)
      }
    }),
  )
}

function uvToCharIndex(
  { size: s, borderInset: b, paddingInset: p }: FlexNodeState,
  uv: Vector2,
  instancedText: InstancedText,
): number {
  const size = s.peek()
  const borderInset = b.peek()
  const paddingInset = p.peek()
  if (size == null || borderInset == null || paddingInset == null) {
    return 0
  }
  const [width, height] = size
  const [bTop, , , bLeft] = borderInset
  const [pTop, , , pLeft] = paddingInset
  const x = uv.x * width - bLeft - pLeft
  const y = -uv.y * height + bTop + pTop
  return instancedText.getCharIndex(x, y)
}
