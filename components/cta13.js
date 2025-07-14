import React, { Fragment } from 'react'

import PropTypes from 'prop-types'
import { useTranslations } from 'next-intl'

const CTA13 = (props) => {
  return (
    <>
      <div className="cta13-container1 thq-section-padding">
        <div className="cta13-max-width thq-section-max-width">
          <div className="cta13-container2 thq-flex-row">
            <h2 className="thq-heading-2">
              {props.heading1 ?? (
                <Fragment>
                  <span className="cta13-text6">
                    Ready to elevate your style?
                  </span>
                </Fragment>
              )}
            </h2>
            <div className="cta13-content">
              <p className="thq-body-large cta13-text2">
                {props.content1 ?? (
                  <Fragment>
                    <span className="cta13-text5">
                      Discover our exclusive collection of products
                    </span>
                  </Fragment>
                )}
              </p>
              <div className="cta13-container3">
                <div className="cta13-row">
                  <div className="cta13-container4">
                    <input
                      type="text"
                      placeholder="Enter your email"
                      className="thq-input"
                    />
                    <button type="button" className="thq-button-filled">
                      <span>
                        {props.action1 ?? (
                          <Fragment>
                            <span className="cta13-text8">Shop Now</span>
                          </Fragment>
                        )}
                      </span>
                    </button>
                  </div>
                </div>
                <span className="thq-body-small">
                  {props.content2 ?? (
                    <Fragment>
                      <span className="cta13-text7">
                        Sign up for our newsletter to receive updates and
                        special offers
                      </span>
                    </Fragment>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
        <img
          alt={props.backgroundImageAlt}
          src={props.backgroundImageSrc}
          className="cta13-background-image thq-img-ratio-16-9"
        />
      </div>
      <style jsx>
        {`
          .cta13-container1 {
            width: 100%;
            height: auto;
            display: flex;
            position: relative;
            align-items: flex-start;
            flex-direction: column;
          }
          .cta13-max-width {
            gap: 80px;
            width: 100%;
            height: auto;
            display: flex;
            z-index: 100;
            overflow: hidden;
            max-width: var(--dl-layout-size-maxwidth);
            align-self: center;
            align-items: flex-start;
            flex-shrink: 0;
            flex-direction: column;
          }
          .cta13-container2 {
            gap: var(--dl-layout-space-fiveunits);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
          }
          .cta13-content {
            gap: var(--dl-layout-space-oneandhalfunits);
            width: 616px;
            display: flex;
            flex-grow: 1;
            align-items: flex-start;
            flex-shrink: 0;
            flex-direction: column;
          }
          .cta13-container3 {
            gap: var(--dl-layout-space-unit);
            flex: 1;
            width: auto;
            display: flex;
            align-self: flex-start;
            align-items: flex-start;
            flex-direction: column;
            justify-content: center;
          }
          .cta13-row {
            flex: 0 0 auto;
            width: 100%;
            height: auto;
            display: flex;
            flex-direction: row;
          }
          .cta13-container4 {
            gap: var(--dl-layout-space-oneandhalfunits);
            width: 100%;
            display: flex;
            align-self: center;
          }
          .cta13-background-image {
            left: 0px;
            width: 100%;
            bottom: 0px;
            height: 100%;
            position: absolute;
            object-fit: cover;
          }
          .cta13-text5 {
            display: inline-block;
          }
          .cta13-text6 {
            display: inline-block;
          }
          .cta13-text7 {
            display: inline-block;
          }
          .cta13-text8 {
            display: inline-block;
          }
          @media (max-width: 991px) {
            .cta13-container2 {
              align-items: center;
              flex-direction: column;
            }
            .cta13-content {
              align-items: center;
            }
            .cta13-container3 {
              width: auto;
              align-self: center;
              align-items: flex-start;
            }
            .cta13-row {
              width: 100%;
              position: relative;
              flex-direction: row;
              justify-content: flex-start;
            }
            .cta13-container4 {
              align-self: flex-end;
              justify-content: center;
            }
          }
          @media (max-width: 767px) {
            .cta13-container2 {
              gap: var(--dl-layout-space-threeunits);
            }
            .cta13-content {
              width: auto;
            }
            .cta13-text2 {
              text-align: center;
            }
          }
          @media (max-width: 479px) {
            .cta13-container2 {
              gap: var(--dl-layout-space-oneandhalfunits);
            }
            .cta13-text2 {
              text-align: left;
            }
            .cta13-row {
              justify-content: center;
            }
            .cta13-container4 {
              flex-direction: column;
            }
          }
        `}
      </style>
    </>
  )
}

CTA13.defaultProps = {
  content1: undefined,
  backgroundImageSrc:
    'https://images.unsplash.com/photo-1550895030-823330fc2551?ixid=M3w5MTMyMXwwfDF8c2VhcmNofDI2N3x8YWJzdHJhY3R8ZW58MHx8fHwxNzEzOTQ2MzU0fDA&ixlib=rb-4.0.3&w=1500',
  backgroundImageAlt: 'Image of products',
  heading1: undefined,
  content2: undefined,
  action1: undefined,
}

CTA13.propTypes = {
  content1: PropTypes.element,
  backgroundImageSrc: PropTypes.string,
  backgroundImageAlt: PropTypes.string,
  heading1: PropTypes.element,
  content2: PropTypes.element,
  action1: PropTypes.element,
}

export default CTA13
