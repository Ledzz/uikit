import { Object3D, Object3DEventMap } from 'three'
import { AllOptionalProperties } from '../properties/default.js'
import { createParentContextSignal, setupParentContextSignal, bindHandlers, Component } from './utils.js'
import { ReadonlySignal, Signal, effect, signal, untracked } from '@preact/signals-core'
import { Subscriptions, initialize, unsubscribeSubscriptions } from '../utils.js'
import { ContentProperties, createContent } from '../components/index.js'
import { MergedProperties } from '../properties/index.js'
import { ThreeEventMap } from '../events.js'

export class Content<T = {}, EM extends ThreeEventMap = ThreeEventMap> extends Component<T> {
  private mergedProperties?: ReadonlySignal<MergedProperties>
  private readonly contentContainer: Object3D
  private readonly styleSignal: Signal<ContentProperties<EM> | undefined> = signal(undefined)
  private readonly propertiesSignal: Signal<ContentProperties<EM> | undefined>
  private readonly defaultPropertiesSignal: Signal<AllOptionalProperties | undefined>
  private readonly contentSubscriptions: Subscriptions = []
  private readonly parentContextSignal = createParentContextSignal()
  private readonly unsubscribe: () => void

  public internals!: ReturnType<typeof createContent>

  constructor(properties?: ContentProperties<EM>, defaultProperties?: AllOptionalProperties) {
    super()
    this.matrixAutoUpdate = false
    setupParentContextSignal(this.parentContextSignal, this)
    this.propertiesSignal = signal(properties)
    this.defaultPropertiesSignal = signal(defaultProperties)
    //setting up the threejs elements
    this.contentContainer = new Object3D()
    this.contentContainer.matrixAutoUpdate = false
    super.add(this.contentContainer)

    this.unsubscribe = effect(() => {
      const parentContext = this.parentContextSignal.value?.value
      if (parentContext == null) {
        return
      }
      const internals = (this.internals = createContent(
        parentContext,
        this.styleSignal,
        this.propertiesSignal,
        this.defaultPropertiesSignal,
        {
          current: this,
        },
        {
          current: this.contentContainer,
        },
      ))
      this.mergedProperties = internals.mergedProperties

      //setup events
      super.add(internals.interactionPanel)
      const subscriptions: Subscriptions = []
      initialize(internals.initializers, subscriptions)
      bindHandlers(internals.handlers, this, subscriptions)
      this.addEventListener('childadded', internals.remeasureContent)
      this.addEventListener('childremoved', internals.remeasureContent)
      return () => {
        this.remove(internals.interactionPanel)
        unsubscribeSubscriptions(subscriptions)
        this.removeEventListener('childadded', internals.remeasureContent)
        this.removeEventListener('childremoved', internals.remeasureContent)
      }
    })
  }

  add(...objects: Object3D<Object3DEventMap>[]): this {
    const objectsLength = objects.length
    for (let i = 0; i < objectsLength; i++) {
      const object = objects[i]
      this.contentContainer.add(object)
    }
    return this
  }

  remove(...objects: Array<Object3D>): this {
    const objectsLength = objects.length
    for (let i = 0; i < objectsLength; i++) {
      const object = objects[i]
      this.contentContainer.remove(object)
    }
    return this
  }

  getComputedProperty<K extends keyof ContentProperties<EM>>(key: K): ContentProperties<EM>[K] | undefined {
    return untracked(() => this.mergedProperties?.value.read(key as string, undefined))
  }

  getStyle(): undefined | Readonly<ContentProperties<EM>> {
    return this.styleSignal.peek()
  }

  setStyle(style: ContentProperties<EM> | undefined, replace?: boolean) {
    this.styleSignal.value = replace ? style : ({ ...this.styleSignal.value, ...style } as any)
  }

  setProperties(properties: ContentProperties<EM> | undefined) {
    this.propertiesSignal.value = properties
  }

  setDefaultProperties(properties: AllOptionalProperties) {
    this.defaultPropertiesSignal.value = properties
  }

  destroy() {
    this.parent?.remove(this)
    unsubscribeSubscriptions(this.contentSubscriptions)
    this.unsubscribe()
  }
}
