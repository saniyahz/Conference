'use client'

import { useState, useEffect } from 'react'
import { X, Printer, MapPin, Package, CreditCard } from 'lucide-react'
import { Story } from '@/app/page'
import { detectUserLocation, GeolocationData } from '@/lib/geolocation'

interface PrintingModalProps {
  story: Story
  isOpen: boolean
  onClose: () => void
}

export default function PrintingModal({ story, isOpen, onClose }: PrintingModalProps) {
  const [step, setStep] = useState<'loading' | 'form' | 'success'>('loading')
  const [location, setLocation] = useState<GeolocationData | null>(null)
  const [partnerInfo, setPartnerInfo] = useState<any>(null)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [orderResult, setOrderResult] = useState<any>(null)

  useEffect(() => {
    if (isOpen) {
      detectLocation()
    }
  }, [isOpen])

  const detectLocation = async () => {
    try {
      const locationData = await detectUserLocation()
      setLocation(locationData)

      // Pre-fill country
      setFormData(prev => ({ ...prev, country: locationData.country }))

      // Get printing partner info
      const response = await fetch('/api/get-printing-partner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageCount: story.pages.length }),
      })

      if (response.ok) {
        const data = await response.json()
        setPartnerInfo(data)
      }

      setStep('form')
    } catch (error) {
      console.error('Error detecting location:', error)
      setStep('form')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // First generate the PDF
      const pdfResponse = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story }),
      })

      if (!pdfResponse.ok) {
        throw new Error('Failed to generate PDF')
      }

      const blob = await pdfResponse.blob()
      const reader = new FileReader()

      reader.onloadend = async () => {
        const base64data = reader.result as string

        // Submit print order
        const orderResponse = await fetch('/api/submit-print-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storyTitle: story.title,
            storyAuthor: story.author,
            pageCount: story.pages.length,
            pdfBase64: base64data,
            shippingAddress: {
              name: formData.name,
              addressLine1: formData.addressLine1,
              addressLine2: formData.addressLine2,
              city: formData.city,
              state: formData.state,
              postalCode: formData.postalCode,
              country: formData.country,
            },
            customerEmail: formData.email,
          }),
        })

        if (!orderResponse.ok) {
          throw new Error('Failed to submit order')
        }

        const result = await orderResponse.json()
        setOrderResult(result)
        setStep('success')
      }

      reader.readAsDataURL(blob)
    } catch (error) {
      console.error('Error submitting print order:', error)
      alert('Failed to submit print order. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Printer className="w-6 h-6 text-purple-600" />
            <h2 className="text-2xl font-bold text-gray-800">Print Your Story</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'loading' && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mb-4"></div>
              <p className="text-gray-600">Detecting your location...</p>
            </div>
          )}

          {step === 'form' && (
            <>
              {/* Partner Info */}
              {partnerInfo && (
                <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-6 mb-6">
                  <div className="flex items-start gap-4">
                    <MapPin className="w-6 h-6 text-purple-600 mt-1" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-800 mb-2">Your Printing Partner</h3>
                      <p className="text-sm text-gray-600 mb-3">
                        Based on your location ({location?.country}), we've selected <strong>{partnerInfo.partner.name}</strong>
                      </p>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500">Estimated Delivery</p>
                          <p className="font-semibold text-purple-600">{partnerInfo.partner.estimatedDeliveryDays} business days</p>
                        </div>
                        {partnerInfo.pricing && (
                          <div>
                            <p className="text-gray-500">Estimated Cost</p>
                            <p className="font-semibold text-purple-600">
                              {partnerInfo.pricing.subtotal} {partnerInfo.pricing.currency}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Shipping Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="John Doe"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="john@example.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Address Line 1 *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.addressLine1}
                    onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="123 Main Street"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Address Line 2
                  </label>
                  <input
                    type="text"
                    value={formData.addressLine2}
                    onChange={(e) => setFormData({ ...formData, addressLine2: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="Apt 4B"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      City *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="New York"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      State/Province
                    </label>
                    <input
                      type="text"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="NY"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Postal Code *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.postalCode}
                      onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="10001"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Country *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="United States"
                  />
                </div>

                <div className="pt-4 border-t border-gray-200">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold flex items-center justify-center gap-2 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        Processing...
                      </>
                    ) : (
                      <>
                        <Package className="w-5 h-5" />
                        Submit Print Order
                      </>
                    )}
                  </button>
                </div>
              </form>
            </>
          )}

          {step === 'success' && orderResult && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Package className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">Order Submitted!</h3>
              <p className="text-gray-600 mb-6">{orderResult.message}</p>

              <div className="bg-gray-50 rounded-lg p-6 text-left mb-6">
                <h4 className="font-semibold text-gray-800 mb-3">Order Details</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Order ID:</span>
                    <span className="font-mono font-semibold">{orderResult.order.orderId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Partner:</span>
                    <span className="font-semibold">{orderResult.order.partner}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total:</span>
                    <span className="font-semibold">{orderResult.order.total} {orderResult.order.currency}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Estimated Delivery:</span>
                    <span className="font-semibold">{orderResult.order.estimatedDelivery}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={onClose}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-all"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
