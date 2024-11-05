import { forwardRef, ReactNode, RefAttributes, useEffect, useMemo, useRef } from 'react'
import { Object3D } from 'three'
import { useParent } from './context.js'
import { AddHandlers, R3FEventMap, usePropertySignals } from './utils.js'
import {
  createText,
  FontFamilies,
  initialize,
  Subscriptions,
  TextProperties as BaseTextProperties,
  unsubscribeSubscriptions,
} from '@pmndrs/uikit/internals'
import { ComponentInternals, useComponentInternals } from './ref.js'
import { Signal, signal } from '@preact/signals-core'
import { useFontFamilies } from './font.js'

export type TextProperties = {
  children: string | Array<string | Signal<string>> | Signal<string>
  name?: string
} & BaseTextProperties<R3FEventMap>

export type TextRef = ComponentInternals<Partial<BaseTextProperties<R3FEventMap>>>

export const Text: (props: TextProperties & RefAttributes<TextRef>) => ReactNode = forwardRef((properties, ref) => {
  const parent = useParent()
  const outerRef = useRef<Object3D>(null)
  const propertySignals = usePropertySignals(properties)
  const textSignal = useMemo(
    () => signal<string | Array<string | Signal<string>> | Signal<string>>(undefined as any),
    [],
  )
  textSignal.value = properties.children
  const fontFamilies = useMemo(() => signal<FontFamilies | undefined>(undefined as any), [])
  fontFamilies.value = useFontFamilies()
  const internals = useMemo(
    () =>
      createText<R3FEventMap>(
        parent,
        textSignal,
        fontFamilies,
        propertySignals.style,
        propertySignals.properties,
        propertySignals.default,
        outerRef,
      ),
    [fontFamilies, parent, propertySignals, textSignal],
  )

  internals.interactionPanel.name = properties.name ?? ''

  useEffect(() => {
    const subscriptions: Subscriptions = []
    initialize(internals.initializers, subscriptions)
    return () => unsubscribeSubscriptions(subscriptions)
  }, [internals])

  useComponentInternals(ref, parent.root.pixelSize, propertySignals.style, internals, internals.interactionPanel)

  return (
    <AddHandlers handlers={internals.handlers} ref={outerRef}>
      <primitive object={internals.interactionPanel} />
    </AddHandlers>
  )
})
