import React, { Fragment } from 'react'

import PropTypes from 'prop-types'
import { useTranslations } from 'next-intl'

const Testimonial173 = (props) => {
  return (
    <>
      <div className="thq-section-padding">
        <div className="testimonial173-max-width thq-section-max-width">
          <div className="testimonial173-container10">
            <h2 className="thq-heading-2">
              {props.heading1 ?? (
                <Fragment>
                  <span className="testimonial173-text25">Testimonials</span>
                </Fragment>
              )}
            </h2>
            <span className="testimonial173-text11 thq-body-small">
              {props.content1 ?? (
                <Fragment>
                  <span className="testimonial173-text37">
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed
                    do eiusmod tempor incididunt ut labore et dolore magna
                    aliqua.
                  </span>
                </Fragment>
              )}
            </span>
          </div>
          <div className="thq-grid-2">
            <div className="thq-animated-card-bg-2">
              <div className="thq-animated-card-bg-1">
                <div
                  data-animated="true"
                  className="thq-card testimonial173-card1"
                >
                  <div className="testimonial173-container12">
                    <img
                      alt={props.author1Alt}
                      src={props.author1Src}
                      className="testimonial173-image1"
                    />
                    <div className="testimonial173-container13">
                      <strong className="thq-body-large">
                        {props.author1Name ?? (
                          <Fragment>
                            <span className="testimonial173-text30">
                              John Doe
                            </span>
                          </Fragment>
                        )}
                      </strong>
                      <span className="thq-body-small">
                        {props.author1Position ?? (
                          <Fragment>
                            <span className="testimonial173-text35">
                              CEO, Company ABC
                            </span>
                          </Fragment>
                        )}
                      </span>
                    </div>
                  </div>
                  <span className="testimonial173-text14 thq-body-small">
                    {props.review1 ?? (
                      <Fragment>
                        <span className="testimonial173-text26">
                          I am extremely satisfied with the services provided.
                          The team was professional and efficient in delivering
                          results.
                        </span>
                      </Fragment>
                    )}
                  </span>
                </div>
              </div>
            </div>
            <div className="thq-animated-card-bg-2">
              <div className="thq-animated-card-bg-1">
                <div
                  data-animated="true"
                  className="thq-card testimonial173-card2"
                >
                  <div className="testimonial173-container14">
                    <img
                      alt={props.author2Alt}
                      src={props.author2Src}
                      className="testimonial173-image2"
                    />
                    <div className="testimonial173-container15">
                      <strong className="thq-body-large">
                        {props.author2Name ?? (
                          <Fragment>
                            <span className="testimonial173-text31">
                              Jane Smith
                            </span>
                          </Fragment>
                        )}
                      </strong>
                      <span className="thq-body-small">
                        {props.author2Position ?? (
                          <Fragment>
                            <span className="testimonial173-text27">
                              Marketing Manager, XYZ Inc.
                            </span>
                          </Fragment>
                        )}
                      </span>
                    </div>
                  </div>
                  <span className="testimonial173-text17 thq-body-small">
                    {props.review2 ?? (
                      <Fragment>
                        <span className="testimonial173-text32">
                          Working with this company has been a game-changer for
                          us. Their attention to detail and dedication to our
                          project were impressive.
                        </span>
                      </Fragment>
                    )}
                  </span>
                </div>
              </div>
            </div>
            <div className="thq-animated-card-bg-2">
              <div className="thq-animated-card-bg-1">
                <div
                  data-animated="true"
                  className="thq-card testimonial173-card3"
                >
                  <div className="testimonial173-container16">
                    <img
                      alt={props.author3Alt}
                      src={props.author3Src}
                      className="testimonial173-image3"
                    />
                    <div className="testimonial173-container17">
                      <strong className="thq-body-large">
                        {props.author3Name ?? (
                          <Fragment>
                            <span className="testimonial173-text36">
                              David Johnson
                            </span>
                          </Fragment>
                        )}
                      </strong>
                      <span className="thq-body-small">
                        {props.author3Position ?? (
                          <Fragment>
                            <span className="testimonial173-text29">
                              Founder, Startup123
                            </span>
                          </Fragment>
                        )}
                      </span>
                    </div>
                  </div>
                  <span className="testimonial173-text20 thq-body-small">
                    {props.review3 ?? (
                      <Fragment>
                        <span className="testimonial173-text24">
                          I would highly recommend their services to anyone
                          looking for quality and reliability. They exceeded our
                          expectations.
                        </span>
                      </Fragment>
                    )}
                  </span>
                </div>
              </div>
            </div>
            <div className="thq-animated-card-bg-2">
              <div className="thq-animated-card-bg-1">
                <div
                  data-animated="true"
                  className="thq-card testimonial173-card4"
                >
                  <div className="testimonial173-container18">
                    <img
                      alt={props.author4Alt}
                      src={props.author4Src}
                      className="testimonial173-image4"
                    />
                    <div className="testimonial173-container19">
                      <strong className="thq-body-large">
                        {props.author4Name ?? (
                          <Fragment>
                            <span className="testimonial173-text28">
                              Sarah Brown
                            </span>
                          </Fragment>
                        )}
                      </strong>
                      <span className="thq-body-small">
                        {props.author4Position ?? (
                          <Fragment>
                            <span className="testimonial173-text33">
                              CTO, Tech Solutions Ltd.
                            </span>
                          </Fragment>
                        )}
                      </span>
                    </div>
                  </div>
                  <span className="testimonial173-text23 thq-body-small">
                    {props.review4 ?? (
                      <Fragment>
                        <span className="testimonial173-text34">
                          The team went above and beyond to ensure our
                          project&apos;s success. Their expertise and
                          professionalism were commendable.
                        </span>
                      </Fragment>
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <style jsx>
        {`
          .testimonial173-max-width {
            display: flex;
            align-items: center;
            flex-direction: column;
          }
          .testimonial173-container10 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            max-width: 600px;
            align-items: center;
            margin-bottom: var(--dl-layout-space-fourunits);
            flex-direction: column;
          }
          .testimonial173-text11 {
            text-align: center;
          }
          .testimonial173-container12 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: flex-start;
            align-items: center;
            flex-direction: row;
            justify-content: center;
          }
          .testimonial173-image1 {
            width: var(--dl-layout-size-small);
            height: var(--dl-layout-size-small);
            object-fit: cover;
            border-radius: var(--dl-layout-radius-round);
          }
          .testimonial173-container13 {
            display: flex;
            align-items: flex-start;
            flex-direction: column;
            justify-content: center;
          }
          .testimonial173-text14 {
            text-align: left;
          }
          .testimonial173-container14 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: flex-start;
            align-items: center;
            flex-direction: row;
            justify-content: center;
          }
          .testimonial173-image2 {
            width: var(--dl-layout-size-small);
            height: var(--dl-layout-size-small);
            object-fit: cover;
            border-radius: var(--dl-layout-radius-round);
          }
          .testimonial173-container15 {
            display: flex;
            align-items: flex-start;
            flex-direction: column;
            justify-content: center;
          }
          .testimonial173-text17 {
            text-align: left;
          }
          .testimonial173-container16 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: flex-start;
            align-items: center;
            flex-direction: row;
            justify-content: center;
          }
          .testimonial173-image3 {
            width: var(--dl-layout-size-small);
            height: var(--dl-layout-size-small);
            object-fit: cover;
            border-radius: var(--dl-layout-radius-round);
          }
          .testimonial173-container17 {
            display: flex;
            align-items: flex-start;
            flex-direction: column;
            justify-content: center;
          }
          .testimonial173-text20 {
            text-align: left;
          }
          .testimonial173-container18 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: flex-start;
            align-items: center;
            flex-direction: row;
            justify-content: center;
          }
          .testimonial173-image4 {
            width: var(--dl-layout-size-small);
            height: var(--dl-layout-size-small);
            object-fit: cover;
            border-radius: var(--dl-layout-radius-round);
          }
          .testimonial173-container19 {
            display: flex;
            align-items: flex-start;
            flex-direction: column;
            justify-content: center;
          }
          .testimonial173-text23 {
            text-align: left;
          }
          .testimonial173-text24 {
            display: inline-block;
          }
          .testimonial173-text25 {
            display: inline-block;
          }
          .testimonial173-text26 {
            display: inline-block;
          }
          .testimonial173-text27 {
            display: inline-block;
          }
          .testimonial173-text28 {
            display: inline-block;
          }
          .testimonial173-text29 {
            display: inline-block;
          }
          .testimonial173-text30 {
            display: inline-block;
          }
          .testimonial173-text31 {
            display: inline-block;
          }
          .testimonial173-text32 {
            display: inline-block;
          }
          .testimonial173-text33 {
            display: inline-block;
          }
          .testimonial173-text34 {
            display: inline-block;
          }
          .testimonial173-text35 {
            display: inline-block;
          }
          .testimonial173-text36 {
            display: inline-block;
          }
          .testimonial173-text37 {
            display: inline-block;
          }
          @media (max-width: 991px) {
            .testimonial173-container10 {
              margin-bottom: var(--dl-layout-space-threeunits);
            }
          }
          @media (max-width: 767px) {
            .testimonial173-container10 {
              margin-bottom: var(--dl-layout-space-oneandhalfunits);
            }
            .testimonial173-card1 {
              width: 100%;
            }
            .testimonial173-card2 {
              width: 100%;
            }
            .testimonial173-card3 {
              width: 100%;
            }
            .testimonial173-card4 {
              width: 100%;
            }
          }
        `}
      </style>
    </>
  )
}

Testimonial173.defaultProps = {
  review3: undefined,
  heading1: undefined,
  review1: undefined,
  author1Src:
    'https://images.unsplash.com/photo-1599566150163-29194dcaad36?ixid=M3w5MTMyMXwwfDF8c2VhcmNofDN8fGF2YXRhcnxlbnwwfHx8fDE3MTYzODM1NTJ8MA&ixlib=rb-4.0.3&w=200',
  author2Position: undefined,
  author4Name: undefined,
  author2Alt: 'Image of Jane Smith',
  author2Src:
    'https://images.unsplash.com/photo-1566492031773-4f4e44671857?ixid=M3w5MTMyMXwwfDF8c2VhcmNofDE1fHxhdmF0YXJ8ZW58MHx8fHwxNzE2MzgzNTUyfDA&ixlib=rb-4.0.3&w=200',
  author3Alt: 'Image of David Johnson',
  author3Src:
    'https://images.unsplash.com/photo-1544725176-7c40e5a71c5e?ixid=M3w5MTMyMXwwfDF8c2VhcmNofDEyfHxhdmF0YXJ8ZW58MHx8fHwxNzE2MzgzNTUyfDA&ixlib=rb-4.0.3&w=200',
  author4Alt: 'Image of Sarah Brown',
  author3Position: undefined,
  author1Name: undefined,
  author2Name: undefined,
  review2: undefined,
  author4Position: undefined,
  author1Alt: 'Image of John Doe',
  review4: undefined,
  author4Src:
    'https://images.unsplash.com/photo-1586297135537-94bc9ba060aa?ixid=M3w5MTMyMXwwfDF8c2VhcmNofDMxfHxhdmF0YXJ8ZW58MHx8fHwxNzE2MzgzNTY2fDA&ixlib=rb-4.0.3&w=200',
  author1Position: undefined,
  author3Name: undefined,
  content1: undefined,
}

Testimonial173.propTypes = {
  review3: PropTypes.element,
  heading1: PropTypes.element,
  review1: PropTypes.element,
  author1Src: PropTypes.string,
  author2Position: PropTypes.element,
  author4Name: PropTypes.element,
  author2Alt: PropTypes.string,
  author2Src: PropTypes.string,
  author3Alt: PropTypes.string,
  author3Src: PropTypes.string,
  author4Alt: PropTypes.string,
  author3Position: PropTypes.element,
  author1Name: PropTypes.element,
  author2Name: PropTypes.element,
  review2: PropTypes.element,
  author4Position: PropTypes.element,
  author1Alt: PropTypes.string,
  review4: PropTypes.element,
  author4Src: PropTypes.string,
  author1Position: PropTypes.element,
  author3Name: PropTypes.element,
  content1: PropTypes.element,
}

export default Testimonial173
