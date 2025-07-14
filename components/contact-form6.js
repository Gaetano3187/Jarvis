import React, { Fragment } from 'react'

import PropTypes from 'prop-types'
import { useTranslations } from 'next-intl'

const ContactForm6 = (props) => {
  return (
    <>
      <div className="contact-form6-contact1 thq-section-padding">
        <div className="thq-section-max-width thq-flex-row contact-form6-max-width">
          <div className="contact-form6-section-title thq-flex-column">
            <span className="thq-body-small">
              {props.content2 ?? (
                <Fragment>
                  <span className="contact-form6-text22">
                    Get in touch with us today!
                  </span>
                </Fragment>
              )}
            </span>
            <div className="contact-form6-content1">
              <h2 className="thq-heading-2">
                {props.heading1 ?? (
                  <Fragment>
                    <span className="contact-form6-text26">Contact us</span>
                  </Fragment>
                )}
              </h2>
              <span className="thq-body-small contact-form6-text12">
                {props.content1 ?? (
                  <Fragment>
                    <span className="contact-form6-text21">
                      Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                      <span
                        dangerouslySetInnerHTML={{
                          __html: ' ',
                        }}
                      />
                    </span>
                  </Fragment>
                )}
              </span>
            </div>
            <div className="contact-form6-content2">
              <div className="contact-form6-row1">
                <svg viewBox="0 0 1024 1024" className="thq-icon-small">
                  <path d="M854 342v-86l-342 214-342-214v86l342 212zM854 170q34 0 59 26t25 60v512q0 34-25 60t-59 26h-684q-34 0-59-26t-25-60v-512q0-34 25-60t59-26h684z"></path>
                </svg>
                <span className="thq-body-small">
                  {props.email ?? (
                    <Fragment>
                      <span className="contact-form6-text23">
                        hello@teleporthq.io
                      </span>
                    </Fragment>
                  )}
                </span>
              </div>
              <div className="contact-form6-row2">
                <svg viewBox="0 0 1024 1024" className="thq-icon-small">
                  <path d="M282 460q96 186 282 282l94-94q20-20 44-10 72 24 152 24 18 0 30 12t12 30v150q0 18-12 30t-30 12q-300 0-513-213t-213-513q0-18 12-30t30-12h150q18 0 30 12t12 30q0 80 24 152 8 26-10 44z"></path>
                </svg>
                <span className="thq-body-small">
                  {props.phone ?? (
                    <Fragment>
                      <span className="contact-form6-text20">
                        +1 (555) 000-0000
                      </span>
                    </Fragment>
                  )}
                </span>
              </div>
              <div className="contact-form6-row3">
                <svg viewBox="0 0 1024 1024" className="thq-icon-small">
                  <path d="M512 0c-176.732 0-320 143.268-320 320 0 320 320 704 320 704s320-384 320-704c0-176.732-143.27-320-320-320zM512 512c-106.040 0-192-85.96-192-192s85.96-192 192-192 192 85.96 192 192-85.96 192-192 192z"></path>
                </svg>
                <span className="thq-body-small">
                  {props.address ?? (
                    <Fragment>
                      <span className="contact-form6-text24">
                        789 Test St, Bucharest
                      </span>
                    </Fragment>
                  )}
                </span>
              </div>
            </div>
          </div>
          <form className="contact-form6-form thq-flex-column">
            <div className="contact-form6-container1">
              <div className="contact-form6-input1">
                <label
                  htmlFor="contact-form-6-first-name"
                  className="thq-body-small"
                >
                  First name
                </label>
                <input
                  type="text"
                  id="contact-form-6-first-name"
                  placeholder="First Name"
                  className="thq-input"
                />
              </div>
              <div className="contact-form6-input2">
                <label
                  htmlFor="contact-form-6-last-name"
                  className="thq-body-small"
                >
                  Last name
                </label>
                <input
                  type="text"
                  id="contact-form-6-last-name"
                  placeholder="Last Name"
                  className="thq-input"
                />
              </div>
            </div>
            <div className="contact-form6-container2">
              <div className="contact-form6-input3">
                <label
                  htmlFor="contact-form-6-email"
                  className="thq-body-small"
                >
                  Email
                </label>
                <input
                  type="email"
                  id="contact-form-6-email"
                  required="true"
                  placeholder="Email"
                  className="thq-input"
                />
              </div>
              <div className="contact-form6-input4">
                <label
                  htmlFor="contact-form-6-phone"
                  className="thq-body-small"
                >
                  Phone Number
                </label>
                <input
                  type="tel"
                  id="contact-form-6-phone"
                  placeholder="Phone Number"
                  className="thq-input"
                />
              </div>
            </div>
            <div className="contact-form6-container3">
              <div className="contact-form6-input5">
                <label
                  htmlFor="contact-form-6-options"
                  className="thq-body-small"
                >
                  Choose one topic
                </label>
                <select
                  id="contact-form-6-options"
                  placeholder="Select one"
                  className="thq-select"
                >
                  <option value="Option 1">Option 1</option>
                  <option value="Option 1">Customer service</option>
                  <option value="Option 2">Finance</option>
                  <option value="Option 2">Option 2</option>
                  <option value="Option 3">Feature request</option>
                  <option value="Option 3">Option 3</option>
                </select>
              </div>
            </div>
            <div className="contact-form6-container4">
              <div className="contact-form6-input6">
                <label
                  htmlFor="contact-form-6-message"
                  className="thq-body-small"
                >
                  Message
                </label>
                <textarea
                  id="contact-form-6-message"
                  rows="3"
                  placeholder="Enter your message"
                  className="thq-input"
                ></textarea>
              </div>
            </div>
            <div className="contact-form6-checkbox1">
              <input
                type="checkbox"
                id="contact-form-6-check"
                checked="true"
                required="true"
                className="thq-checkbox"
              />
              <label htmlFor="contact-form-6-check" className="thq-body-small">
                I accept the Terms
              </label>
            </div>
            <button
              type="submit"
              className="contact-form6-button thq-button-filled"
            >
              <span className="thq-body-small">
                {props.action ?? (
                  <Fragment>
                    <span className="contact-form6-text25">Submit</span>
                  </Fragment>
                )}
              </span>
            </button>
          </form>
        </div>
      </div>
      <style jsx>
        {`
          .contact-form6-contact1 {
            display: flex;
            position: relative;
            align-items: center;
            flex-direction: column;
          }
          .contact-form6-section-title {
            gap: var(--dl-layout-space-unit);
            width: 40%;
            align-items: flex-start;
          }
          .contact-form6-content1 {
            gap: var(--dl-layout-space-oneandhalfunits);
            display: flex;
            align-self: stretch;
            flex-direction: column;
          }
          .contact-form6-content2 {
            gap: 16px;
            display: flex;
            padding: 8px 0;
            align-items: flex-start;
            flex-direction: column;
          }
          .contact-form6-row1 {
            gap: 16px;
            display: flex;
            align-items: flex-start;
          }
          .contact-form6-row2 {
            gap: 16px;
            display: flex;
            align-items: flex-start;
          }
          .contact-form6-row3 {
            gap: 16px;
            display: flex;
            align-items: flex-start;
          }
          .contact-form6-form {
            gap: var(--dl-layout-space-oneandhalfunits);
            width: 60%;
          }
          .contact-form6-container1 {
            gap: var(--dl-layout-space-unit);
            flex: 0 0 auto;
            width: 100%;
            display: flex;
            align-items: flex-start;
            flex-direction: row;
          }
          .contact-form6-input1 {
            gap: var(--dl-layout-space-halfunit);
            width: 50%;
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-direction: column;
          }
          .contact-form6-input2 {
            gap: var(--dl-layout-space-halfunit);
            width: 50%;
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-direction: column;
          }
          .contact-form6-container2 {
            gap: var(--dl-layout-space-unit);
            flex: 0 0 auto;
            width: 100%;
            display: flex;
            align-items: flex-start;
            flex-direction: row;
          }
          .contact-form6-input3 {
            gap: var(--dl-layout-space-halfunit);
            width: 50%;
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-direction: column;
          }
          .contact-form6-input4 {
            gap: var(--dl-layout-space-halfunit);
            width: 50%;
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-direction: column;
          }
          .contact-form6-container3 {
            flex: 0 0 auto;
            width: 50%;
            display: flex;
            align-self: flex-start;
            align-items: flex-start;
            flex-direction: column;
          }
          .contact-form6-input5 {
            gap: var(--dl-layout-space-halfunit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-direction: column;
          }
          .contact-form6-container4 {
            flex: 0 0 auto;
            width: 100%;
            display: flex;
            align-self: flex-start;
            align-items: flex-start;
            flex-direction: column;
          }
          .contact-form6-input6 {
            gap: var(--dl-layout-space-halfunit);
            width: 100%;
            display: flex;
            align-self: flex-start;
            align-items: flex-start;
            flex-direction: column;
          }
          .contact-form6-checkbox1 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: flex-start;
            align-items: center;
          }
          .contact-form6-button {
            align-self: flex-start;
          }
          .contact-form6-text20 {
            display: inline-block;
          }
          .contact-form6-text21 {
            display: inline-block;
          }
          .contact-form6-text22 {
            display: inline-block;
          }
          .contact-form6-text23 {
            display: inline-block;
          }
          .contact-form6-text24 {
            display: inline-block;
          }
          .contact-form6-text25 {
            display: inline-block;
          }
          .contact-form6-text26 {
            display: inline-block;
          }
          @media (max-width: 991px) {
            .contact-form6-max-width {
              align-items: flex-start;
              flex-direction: column;
            }
            .contact-form6-section-title {
              width: 100%;
            }
            .contact-form6-form {
              width: 100%;
            }
            .contact-form6-container1 {
              gap: var(--dl-layout-space-twounits);
              width: 100%;
              flex-direction: row;
            }
            .contact-form6-input1 {
              width: 50%;
            }
            .contact-form6-input2 {
              width: 50%;
              flex-direction: column;
            }
            .contact-form6-container2 {
              gap: var(--dl-layout-space-twounits);
              width: 100%;
              flex-direction: row;
            }
            .contact-form6-input3 {
              width: 50%;
            }
            .contact-form6-input4 {
              width: 50%;
            }
            .contact-form6-container3 {
              gap: var(--dl-layout-space-twounits);
              width: 100%;
              flex-direction: row;
            }
            .contact-form6-input5 {
              gap: var(--dl-layout-space-halfunit);
              width: 50%;
              flex-direction: column;
            }
            .contact-form6-container4 {
              gap: var(--dl-layout-space-twounits);
              width: 100%;
              flex-direction: row;
            }
            .contact-form6-checkbox1 {
              align-self: flex-start;
            }
          }
          @media (max-width: 479px) {
            .contact-form6-text12 {
              text-align: center;
            }
            .contact-form6-form {
              padding: var(--dl-layout-space-unit);
            }
            .contact-form6-container1 {
              align-items: stretch;
              flex-direction: column;
            }
            .contact-form6-input1 {
              width: 100%;
            }
            .contact-form6-input2 {
              width: 100%;
            }
            .contact-form6-container2 {
              align-items: stretch;
              flex-direction: column;
            }
            .contact-form6-input3 {
              width: 100%;
            }
            .contact-form6-input4 {
              width: 100%;
            }
          }
        `}
      </style>
    </>
  )
}

ContactForm6.defaultProps = {
  phone: undefined,
  content1: undefined,
  content2: undefined,
  email: undefined,
  address: undefined,
  action: undefined,
  heading1: undefined,
}

ContactForm6.propTypes = {
  phone: PropTypes.element,
  content1: PropTypes.element,
  content2: PropTypes.element,
  email: PropTypes.element,
  address: PropTypes.element,
  action: PropTypes.element,
  heading1: PropTypes.element,
}

export default ContactForm6
