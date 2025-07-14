import React, { Fragment } from 'react'

import PropTypes from 'prop-types'
import { useTranslations } from 'next-intl'

const ContactForm1 = (props) => {
  return (
    <>
      <div className="contact-form1-contact1 thq-section-padding">
        <div className="contact-form1-max-width thq-section-max-width">
          <div className="contact-form1-container1">
            <div className="contact-form1-section-title thq-card">
              <span className="thq-body-small">
                {props.content2 ?? (
                  <Fragment>
                    <span className="contact-form1-text16">
                      Get in touch with us today!
                    </span>
                  </Fragment>
                )}
              </span>
              <h2 className="thq-heading-2">
                {props.heading1 ?? (
                  <Fragment>
                    <span className="contact-form1-text18">Contact us</span>
                  </Fragment>
                )}
              </h2>
              <span className="thq-body-small">
                {props.content1 ?? (
                  <Fragment>
                    <span className="contact-form1-text19">
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
            <form className="thq-card">
              <div className="contact-form1-container2">
                <div className="contact-form1-input1 thq-flex-row">
                  <label
                    htmlFor="contact-form-1-name"
                    className="thq-body-small"
                  >
                    Name
                  </label>
                  <input
                    type="text"
                    id="contact-form-1-name"
                    placeholder="Name"
                    className="contact-form1-text-input1 thq-input"
                  />
                </div>
                <div className="contact-form1-input2 thq-flex-row">
                  <label
                    htmlFor="contact-form-1-email"
                    className="thq-body-small"
                  >
                    Email
                  </label>
                  <input
                    type="email"
                    id="contact-form-1-email"
                    required="true"
                    placeholder="Email"
                    className="contact-form1-text-input2 thq-input"
                  />
                </div>
              </div>
              <div className="contact-form1-checkbox1 thq-flex-row">
                <input
                  type="checkbox"
                  id="contact-form-1-check"
                  checked="true"
                  required="true"
                  className="thq-checkbox"
                />
                <label
                  htmlFor="contact-form-1-check"
                  className="thq-body-small"
                >
                  I accept the Terms
                </label>
              </div>
              <button
                type="submit"
                className="contact-form1-button thq-button-filled"
              >
                <span className="thq-body-small">
                  {props.action ?? (
                    <Fragment>
                      <span className="contact-form1-text17">Submit</span>
                    </Fragment>
                  )}
                </span>
              </button>
            </form>
          </div>
        </div>
      </div>
      <style jsx>
        {`
          .contact-form1-contact1 {
            display: flex;
            position: relative;
            align-items: center;
            flex-direction: column;
          }
          .contact-form1-max-width {
            display: flex;
            align-items: flex-start;
            flex-direction: column;
          }
          .contact-form1-container1 {
            display: flex;
            align-items: stretch;
            flex-direction: column;
          }
          .contact-form1-section-title {
            align-self: flex-start;
          }
          .contact-form1-container2 {
            gap: var(--dl-layout-space-oneandhalfunits);
            display: flex;
            align-self: stretch;
            align-items: stretch;
            flex-direction: column;
            justify-content: center;
          }
          .contact-form1-input1 {
            width: 100%;
            align-self: flex-start;
            justify-content: space-between;
          }
          .contact-form1-text-input1 {
            flex: 1;
          }
          .contact-form1-input2 {
            width: 100%;
            align-self: flex-start;
            justify-content: space-between;
          }
          .contact-form1-text-input2 {
            flex: 1;
          }
          .contact-form1-checkbox1 {
            align-self: flex-start;
          }
          .contact-form1-button {
            align-self: flex-start;
          }
          .contact-form1-text16 {
            display: inline-block;
          }
          .contact-form1-text17 {
            display: inline-block;
          }
          .contact-form1-text18 {
            display: inline-block;
          }
          .contact-form1-text19 {
            display: inline-block;
          }
          @media (max-width: 991px) {
            .contact-form1-input1 {
              align-items: center;
              flex-direction: row;
            }
            .contact-form1-input2 {
              align-items: center;
              flex-direction: row;
            }
            .contact-form1-checkbox1 {
              width: 100%;
              align-items: center;
              flex-direction: row;
            }
          }
        `}
      </style>
    </>
  )
}

ContactForm1.defaultProps = {
  content2: undefined,
  action: undefined,
  heading1: undefined,
  content1: undefined,
}

ContactForm1.propTypes = {
  content2: PropTypes.element,
  action: PropTypes.element,
  heading1: PropTypes.element,
  content1: PropTypes.element,
}

export default ContactForm1
